/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2017, 2018. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/
/* eslint max-depth: ["error", 7]*/

import PropertiesStore from "./properties-store.js";
import logger from "../../utils/logger";
import UiConditionsParser from "./ui-conditions/ui-conditions-parser.js";
import UiGroupsParser from "./ui-conditions/ui-groups-parser.js";
import conditionsUtil from "./ui-conditions/conditions-utils";
import PropertyUtils from "./util/property-utils.js";
import { STATES, ACTIONS } from "./constants/constants.js";
import CommandStack from "../command-stack/command-stack.js";
import ControlFactory from "./editor-controls/control-factory";
import { ControlType } from "./constants/form-constants";
import cloneDeep from "lodash/cloneDeep";

export default class PropertiesController {

	constructor() {
		this.propertiesStore = new PropertiesStore();
		this.handlers = {
			propertyListener: null,
			controllerHandler: null,
			actionHandler: null
		};
		this.visibleDefinition = {};
		this.enabledDefinitions = {};
		this.validationDefinitions = {};
		this.filterDefinitions = {};
		this.filteredEnumDefinitions = {};
		this.panelTree = {};
		this.controls = {};
		this.customControls = [];
		this.summaryPanelControls = {};
		this.controllerHandlerCalled = false;
		this.requiredParameters = []; // TODO this is needed for validateInput, will change to use this.controls later
		this.commandStack = new CommandStack();
		this.custPropSumPanelValues = {};
		this.controlFactory = new ControlFactory(this);
		this.sharedCtrlInfo = [];
		this.isSummaryPanel = false;
		this.visibleSubPanelCounter = 0;
	}
	subscribe(callback) {
		this.propertiesStore.subscribe(callback);
	}

	getHandlers() {
		return this.handlers;
	}

	setHandlers(inHandlers) {
		this.handlers = Object.assign(this.handlers, inHandlers);
		if (this.handlers.controllerHandler && !this.controllerHandlerCalled) {
			this.handlers.controllerHandler(this); // ontime call to return controller
			// probably isn't needed but seems like it can cause infinite loops
			this.controllerHandlerCalled = true;
		}
	}

	setCommandStack(commandStack) {
		this.commandStack = commandStack;
	}

	getCommandStack() {
		return this.commandStack;
	}

	//
	// Form and parsing Methods
	//
	setForm(form) {
		this.form = form;
		// set initial property values
		if (this.form) {
			this.controls = {};
			this.setControlStates({}); // clear state
			this.setErrorMessages({}); // clear messages
			this.isSummaryPanel = false; // when new form is set, summary panel is gone
			this.visibleSubPanelCounter = 0;
			this._parseUiConditions();
			// should be done before running any validations
			const controls = UiConditionsParser.parseControls([], this.form);
			this.saveControls(controls); // saves controls without the subcontrols
			this._parseSummaryControls(controls);
			let datasetMetadata;
			if (this.form.data) {
				datasetMetadata = this.form.data.datasetMetadata;
				this.setPropertyValues(this.form.data.currentParameters);
			}
			this.setDatasetMetadata(datasetMetadata);
			// get all the children for panels that have conditions. Must be run after setPropertyValues(),
			// which generates the list of panels with conditions
			const panels = Object.keys(this.getPanelStates());
			this.parsePanelTree(panels);
			// Calling setPropertyValues() again after parsePanelTree to run the conditions for the all the
			// panel's children and set the correct states.
			// Need to set initial to true for initial rendering of the panel's children in the correct state
			this.setPropertyValues(this.form.data.currentParameters, true);

			this.requiredParameters = this._parseRequiredParameters(this.form, controls); // TODO remove this when we switch to using this.controls in validateInput
			// for control.type of structuretable that do not use FieldPicker, we need to add to
			// the controlValue any missing data model fields.  We need to do it here so that
			// validate can run against the added fields
			this._addToControlValues();
			// we need to take another pass through to resolve any default values that are parameterRefs.
			// we need to do it here because the parameter that is referenced in the parameterRef may need to have a
			// default value set in the above loop.
			this._addToControlValues(true);
			this.uiItems = this.form.uiItems; // set last so properties dialog doesn't render too early
		}
	}
	getForm() {
		return this.form;
	}

	setAppData(appData) {
		this.appData = appData;
	}
	getAppData() {
		return this.appData;
	}

	_parseUiConditions() {
		this.visibleDefinition = {};
		this.enabledDefinitions = {};
		this.validationDefinitions = {};
		this.filterDefinitions = {};
		this.filteredEnumDefinitions = {};
		if (this.form.conditions) {
			for (const condition of this.form.conditions) {
				if (condition.visible) {
					UiConditionsParser.parseConditions(this.visibleDefinition, condition, "visible");
				} else if (condition.enabled) {
					UiConditionsParser.parseConditions(this.enabledDefinitions, condition, "enabled");
				} else if (condition.validation) {
					UiConditionsParser.parseConditions(this.validationDefinitions, condition, "validation");
				} else if (condition.filter) {
					UiConditionsParser.parseConditions(this.filterDefinitions, condition, "filter");
				} else if (condition.enum_filter) {
					UiConditionsParser.parseConditions(this.filteredEnumDefinitions, condition, "enum_filter");
				} else { // invalid
					logger.info("Invalid definition: " + JSON.stringify(condition));
				}
			}
		}
	}

	/**
	* Used to convert a propertyId to a propertyId that always has a row.
	* Used in complex types that aren't tables and don't have rows.  Returns original
	* propertyId or a propertyId where col is converted to row.  Used in messages and property values since they
	* are stored name -> row -> col
	* @param propertyId
	* @return propertyId
	*/
	convertPropertyId(propertyId) {
		// used for complex types that aren't tables
		if (propertyId && typeof propertyId.col !== "undefined" && typeof propertyId.row === "undefined") {
			return {
				name: propertyId.name,
				row: propertyId.col
			};
		}
		return propertyId;
	}
	parsePanelTree(panels) {
		for (const panel of panels) {
			this.panelTree[panel] = {
				panels: [],
				controls: []
			};
			UiGroupsParser.parseUiContent(this.panelTree, panel, this.form);
		}
	}

	// returns true if child belongs to parent
	isPanelParent(childPanel, parentPanel) {
		const tree = this.panelTree;
		if (tree[parentPanel] && tree[parentPanel].panels && tree[parentPanel].panels.indexOf(childPanel) > -1) {
			return true;
		}

		// check if top level parent
		if (childPanel === parentPanel) {
			for (const panel in tree) {
				if (panel.panels && panel.panels.indexOf(childPanel) > -1) {
					return false;
				}
			}
			return true;
		}
		return false;
	}

	_addToControlValues(resolveParameterRefs) {
		for (const keyName in this.controls) {
			if (!this.controls.hasOwnProperty(keyName)) {
				continue;
			}
			const control = this.controls[keyName];
			const propertyId = { name: control.name };
			let controlValue = this.getPropertyValue(propertyId);
			if (resolveParameterRefs) {
				if (typeof controlValue !== "undefined" && controlValue !== null && typeof controlValue.parameterRef !== "undefined") {
					controlValue = this.getPropertyValue({ name: controlValue.parameterRef });
					this.updatePropertyValue(propertyId, controlValue);
				}
			} else if (control.controlType === "structuretable" && control.addRemoveRows === false) {
				controlValue = this._populateFieldData(controlValue, control);
				this.updatePropertyValue(propertyId, controlValue);
			} else if (typeof control.valueDef !== "undefined" && typeof control.valueDef.defaultValue !== "undefined" &&
				(typeof controlValue === "undefined")) {
				controlValue = control.valueDef.defaultValue;
				this.updatePropertyValue(propertyId, controlValue);
			}
		}
	}

	_populateFieldData(controlValue, control) {
		const rowData = [];
		const fields = this.getDatasetMetadataFields();
		const updateCells = [];
		for (let i = 0; i < fields.length; i++) {
			const row = [];
			const fieldIndex = this._indexOfField(fields[i].name, controlValue);
			for (let k = 0; k < control.subControls.length; k++) {
				if (k === control.keyIndex) {
					row.push(fields[i].name);
				} else if (fieldIndex > -1 && controlValue.length > i && controlValue[i].length > k) {
					row.push(controlValue[i][k]);
				} else {
					row.push(this._getDefaultSubControlValue(k, fields[i].name, fields, control));
					updateCells.push([i, k]);
				}
			}
			rowData.push(row);
		}
		return rowData;
	}

	_getDefaultSubControlValue(col, fieldName, fields, control) {
		let val;
		const subControl = control.subControls[col];
		if (PropertyUtils.toType(subControl.valueDef.defaultValue) !== "undefined") {
			val = subControl.valueDef.defaultValue;
			if (val.parameterRef) {
				val = this.getPropertyValue({ name: val.parameterRef });
			}
		} else if (PropertyUtils.toType(subControl.dmDefault) !== "undefined") {
			val = this._getDMDefault(subControl, fieldName, fields);
		} else if (subControl.values) {
			val = subControl.values[0];
		} else if (subControl.valueDef.propType === "string") {
			val = "";
		} else if (subControl.valueDef.propType === "boolean") {
			val = false;
		} else if (subControl.valueDef.propType === "enum") {
			val = subControl.values[0];
		} else if (subControl.valueDef.propType === "integer" ||
								subControl.valueDef.propType === "long" ||
								subControl.valueDef.propType === "double") {
			val = 0;
		} else {
			val = null;
		}
		return val;
	}

	_getDMDefault(subControlDef, fieldName, fields) {
		let defaultValue;
		const dmField = subControlDef.dmDefault;
		if (fieldName) {
			for (const field of fields) {
				if (field.name === fieldName) {
					switch (dmField) {
					case "type":
						defaultValue = field.type;
						break;
					case "description":
						defaultValue = field.description;
						break;
					case "measure":
						defaultValue = field.measure;
						break;
					case "modeling_role":
						defaultValue = field.modeling_role;
						break;
					default:
						break;
					}
					break;
				}
			}
		}
		return defaultValue;
	}

	_indexOfField(fieldName, controlValue) {
		for (let i = 0; i < controlValue.length; i++) {
			if (controlValue[i][0] === fieldName) {
				return i;
			}
		}
		return -1;
	}

	// TODO remove this
	_parseRequiredParameters(form, controls) {
		let requiredParameters = [];
		requiredParameters = UiConditionsParser.parseRequiredParameters(requiredParameters, form, controls);
		return requiredParameters;
	}

	getUiItems() {
		return this.uiItems;
	}

	addSharedControls(id, controlsNames) {
		this.sharedCtrlInfo.push({ "id": id, "controlNames": controlsNames });
	}

	getSharedCtrlInfo() {
		return this.sharedCtrlInfo;
	}

	isSummaryPanelShowing() {
		return this.isSummaryPanel;
	}

	setIsSummaryPanelShowing(isSummaryPanelShowing) {
		this.isSummaryPanel = isSummaryPanelShowing;
	}

	increaseVisibleSubPanelCounter() {
		this.visibleSubPanelCounter++;
	}

	decreaseVisibleSubPanelCounter() {
		this.visibleSubPanelCounter--;
	}

	isSubPanelsShowing() {
		return this.visibleSubPanelCounter > 0;
	}

	/**
	* Returns title
	*	@return string
	*/
	getTitle() {
		return this.propertiesStore.getTitle();
	}

	/**
	* Sets title for common-properties
	*	@param title string
	*/
	setTitle(title) {
		return this.propertiesStore.setTitle(title);
	}

	/**
	* Returns datasetMetadata passed into common-properties
	*	@return passed in value
	*/
	getDatasetMetadata() {
		return this.propertiesStore.getDatasetMetadata().schemas;
	}

	/**
	* Returns a list field objects.  Based on datasetMetadata passed int common-properties
	*	@return array[field]
	*/
	getDatasetMetadataFields() {
		return this.propertiesStore.getDatasetMetadata().fields;
	}

	/**
	* Returns a list of schema names
	*	@return array[string]
	*/
	getDatasetMetadataSchemas() {
		return this.propertiesStore.getDatasetMetadata().schemaNames;
	}

	/**
	* Returns a list field objects filtered. These are filterd by conditions and
	* by shared controls
	* @param propertyId Propertied id of the control requesting the fields
	* @return array[field]
	*/
	getFilteredDatasetMetadata(propertyId) {
		let fields = this.getDatasetMetadataFields();
		if (propertyId) {
			fields = this._filterSharedDataset(propertyId, fields);
			fields = conditionsUtil.filterConditions(propertyId, this.filterDefinitions, this, fields);
		}
		return fields;
	}

	/**
	 * Retrieves a filtered data model in which all fields that are already
	 * in use by other controls are already filtered out.
	 *
	 * @param propertyId Name of control to skip when checking field controls
	 * @param fields array of available fields to be filtered
	 * @return Filtered fields with fields in use removed
	 */
	_filterSharedDataset(propertyId, fields) {
		if (!this.sharedCtrlInfo || !propertyId) {
			return fields;
		}
		const skipControlName = propertyId.name;
		try {
			// gets all the controls that are shared with this property
			let sharedCtrlNames = [];
			for (const sharedCtrlList of this.sharedCtrlInfo) {
				for (const sharedCtrl of sharedCtrlList.controlNames) {
					if (skipControlName === sharedCtrl.controlName) {
						sharedCtrlNames = sharedCtrlList.controlNames;
						break;
					}
				}
			}
			// get all the fields that are used by other controls
			const usedFields = [];
			for (const sharedCtr of sharedCtrlNames) {
				const ctrlName = sharedCtr.controlName;
				if (ctrlName !== skipControlName) {
					// only remove from the main list the values that are in other controls
					const propValue = this.getPropertyValue({ name: ctrlName });
					if (Array.isArray(propValue)) {
						for (const arrayValue of propValue) {
							if (Array.isArray(arrayValue)) {
								const fieldIdx = PropertyUtils.getTableFieldIndex(this.getControl({ name: ctrlName }));
								if (fieldIdx >= 0 && fieldIdx < arrayValue.length) {
									usedFields.push(arrayValue[fieldIdx]);
								}
							} else { // one dimensional arrays
								usedFields.push(arrayValue);
							}
						}
					} else if (typeof propValue === "string") { // simple property values
						usedFields.push(propValue);
					}
				}
			}
			const usedFieldsList = Array.from(new Set(usedFields)); // make all values unique
			const filteredFields = fields.filter(function(field) {
				return usedFieldsList.indexOf(field.name) === -1;
			});
			return filteredFields;
		} catch (error) {
			logger.warn("Error filtering shared controls " + error);
		}
		return fields;
	}

	/**
	 * This method parses the inDatasetMetadata into fields and schemaNames to be
	 * used throughout common-properties
	 *
	 * @param inDatasetMetadata datasetMetadata schema.
	 */
	setDatasetMetadata(inDatasetMetadata) {
		const schemaNames = [];
		const fields = [];
		if (inDatasetMetadata) {
			let schemas = cloneDeep(inDatasetMetadata);
			// in the 2.0 schema only arrays are support but we want to support both for now.  Internally everything should be an array
			if (!Array.isArray(schemas)) {
				schemas = [schemas];
			}
			// make sure all schemas have a name
			for (let j = 0; j < schemas.length; j++) {
				if (!schemas[j].name) {
					schemas[j].name = j.toString();
				}
				schemas[j].idx = j; // used to set dup names
			}
			// make sure all schemas have a unique names
			for (const schema of schemas) {
				const dupNamedSchemas = schemas.filter(function(filterSchema) {
					return filterSchema.name === schema.name;
				});
				if (dupNamedSchemas && dupNamedSchemas.length > 1) {
					for (let j = 0; j < dupNamedSchemas.length; j++) {
						dupNamedSchemas[j].name = dupNamedSchemas[j].name + "_" + dupNamedSchemas[j].idx;
					}
				}
			}

			// process all fields into single array
			for (const schema of schemas) {
				schemaNames.push(schema.name);
				if (schema.fields) {
					for (const field of schema.fields) {
						field.schema = schema.name;
						field.origName = field.name; // original name
						fields.push(field);
					}
				}
			}
			// add schema name if there are duplicate field names
			const isMultipleSchemas = schemas.length > 1;
			if (isMultipleSchemas) {
				for (const field of fields) {
					const foundFields = fields.filter(function(elementField) {
						return field.origName === elementField.origName;
					});
					if (foundFields.length > 1) {
						field.name = field.schema + "." + field.origName;
					}
				}
			}
		}
		// store values in redux
		this.propertiesStore.setDatasetMetadata({ schemas: inDatasetMetadata, fields: fields, schemaNames: schemaNames });
	}

	validateInput(propertyId) {
		conditionsUtil.validateInput(propertyId, this, this.validationDefinitions);
	}

	//
	// Table row selections
	//
	getSelectedRows(controlName) {
		return this.propertiesStore.getSelectedRows(controlName);
	}

	updateSelectedRows(controlName, selection) {
		this.propertiesStore.updateSelectedRows(controlName, selection);
	}

	clearSelectedRows(controlName) {
		this.propertiesStore.clearSelectedRows(controlName);
	}

	/**
	* Retrieve filtered enumeration items.
	*
	* @param propertyId The unique property identifier
	* @param enumSet An object containing equal sized values and valueLabels arrays
	* @return Either the input object or a new object containing filtered items
	*/
	getFilteredEnumItems(propertyId, enumSet) {
		const replacementItems = this.propertiesStore.getFilteredEnumItems(propertyId);
		if (replacementItems && PropertyUtils.toType(replacementItems) === "array") {
			const newControl = {};
			newControl.values = [];
			newControl.valueLabels = [];
			for (let idx = 0; idx < replacementItems.length; idx++) {
				newControl.values.push(replacementItems[idx]);
				let label = replacementItems[idx];
				const index = enumSet.values.findIndex(function(value) {
					return value === replacementItems[idx];
				});
				if (index > -1) {
					label = enumSet.valueLabels[index];
				}
				newControl.valueLabels.push(label);
			}
			return newControl;
		}
		return enumSet;
	}

	/*
	* Property Values Methods
	*/
	updatePropertyValue(inPropertyId, value) {
		const propertyId = this.convertPropertyId(inPropertyId);
		this.propertiesStore.updatePropertyValue(propertyId, value);
		const definitions = {
			visibleDefinition: this.visibleDefinition,
			enabledDefinitions: this.enabledDefinitions,
			filteredEnumDefinitions: this.filteredEnumDefinitions
		};
		conditionsUtil.validateConditions(this, definitions);
		conditionsUtil.validateInput(inPropertyId, this, this.validationDefinitions);
		if (this.handlers.propertyListener) {
			this.handlers.propertyListener(
				{
					action: ACTIONS.UPDATE_PROPERTY,
					property: inPropertyId,
					value: value
				}
			);
		}
	}

	getPropertyValue(inPropertyId, filterHiddenDisabled) {
		const propertyId = this.convertPropertyId(inPropertyId);
		const propertyValue = this.propertiesStore.getPropertyValue(propertyId);
		let filteredValue;
		// don't return hidden/disabled values
		if (filterHiddenDisabled) {
			// top level value
			const controlState = this.getControlState(propertyId);
			if (controlState === STATES.DISABLED || controlState === STATES.HIDDEN) {
				return filteredValue;
			}
			// copy array to modify it and clear out disabled/hidden values
			filteredValue = JSON.parse(JSON.stringify(propertyValue));
			if (Array.isArray(filteredValue)) {
				for (let rowIdx = 0; rowIdx < filteredValue.length; rowIdx++) {
					const rowValue = filteredValue[rowIdx];
					if (Array.isArray(rowValue)) {
						for (let colIdx = 0; colIdx < rowValue.length; colIdx++) {
							const colPropertyId = {
								name: propertyId.name,
								row: rowIdx,
								col: colIdx
							};
							const valueState = this.getControlState(colPropertyId);
							if (valueState === STATES.DISABLED || valueState === STATES.HIDDEN) {
								filteredValue[rowIdx][colIdx] = null;
							}
						}
					}
				}
			}
			return filteredValue;
		}
		return propertyValue;
	}

	getPropertyValues(filterHiddenDisabled) {
		const propertyValues = this.propertiesStore.getPropertyValues();
		if (filterHiddenDisabled) {
			const filteredValues = {};
			for (const propKey in propertyValues) {
				if (!propertyValues.hasOwnProperty(propKey)) {
					continue;
				}
				const filteredValue = this.getPropertyValue({ name: propKey }, filterHiddenDisabled);
				// only set parameters with values
				if (typeof filteredValue !== "undefined") {
					filteredValues[propKey] = filteredValue;
				}
			}
			return filteredValues;
		}
		return propertyValues;
	}

	setPropertyValues(values, initial) {
		this.propertiesStore.setPropertyValues(values);
		const definitions = {
			visibleDefinition: this.visibleDefinition,
			enabledDefinitions: this.enabledDefinitions,
			filteredEnumDefinitions: this.filteredEnumDefinitions
		};
		conditionsUtil.validateConditions(this, definitions, initial);
		if (this.handlers.propertyListener) {
			this.handlers.propertyListener(
				{
					action: ACTIONS.SET_PROPERTIES
				}
			);
		}
	}

	/**
	 * Control States Methods
	 * Sets the control state. Supported states are:
	 * "disabled", "enabled", "hidden", "visible".
	 */
	setControlStates(states) {
		this.propertiesStore.setControlStates(states);
	}

	/**
	 * State object may have up to 4 attributes
	 * hidden: boolean value indicating if this control should be hidden
	 * disabled: boolean value indicating if this control should be disabled
	 * value: required string value of either "hidden", "disabled", "visible", or "enabled"
	 * setBy: required string value of either "panel" or "control", determined by the attribute 'value'
	 * (hidden and disabled attributes are needed in the case where multiple panels/controls set different states on the control)
	*/
	updateControlState(propertyId, state) {
		this.propertiesStore.updateControlState(propertyId, state);
	}
	getControlState(propertyId) {
		return this.propertiesStore.getControlState(propertyId);
	}
	getControlStates() {
		return this.propertiesStore.getControlStates();
	}

	/**
	 * Panel States Methods
	 * Sets the panel state. Supported states are:
	 * "disabled", "enabled", "hidden", "visible".
	 */
	setPanelStates(states) {
		this.propertiesStore.setPanelStates(states);
	}

	/**
	 * State object may have up to 4 attributes
	 * hidden: boolean value indicating if this panel should be hidden
	 * disabled: boolean value indicating if this panel should be disabled
	 * value: required string value of either "hidden", "disabled", "visible", or "enabled"
	 * setBy: required string value of the panel id who set the attribute 'value', or "" if set by a control
	 * (hidden and disabled attributes are needed in the case where multiple panels/controls set different states on the control)
	*/
	updatePanelState(panelId, state) {
		this.propertiesStore.updatePanelState(panelId, state);
	}
	getPanelState(panelId) {
		return this.propertiesStore.getPanelState(panelId);
	}
	getPanelStates() {
		return this.propertiesStore.getPanelStates();
	}

	/**
	* Error Messages Methods
	* @param messages object with keys being property name
	*/
	setErrorMessages(messages) {
		this.propertiesStore.setErrorMessages(messages);
	}

	/**
	*	Converts pipeline-flow error messages to messages common-properties can handle
	* @param messages array of messages in pipeline-flow schema format
	*/
	setPipelineErrorMessages(messages) {
		this.setErrorMessages({});
		if (Array.isArray(messages)) {
			messages.forEach((message) => {
				this.updateErrorMessage({ name: message.id_ref },
					{ type: message.type, text: message.text, validation_id: message.validation_id });
			});
		}
	}

	/**
	* returns a single error message for a propertyId
	* @param inPropertyId boolean
	* @return error message object
	*/
	getErrorMessage(inPropertyId) {
		const propertyId = this.convertPropertyId(inPropertyId);
		return this.propertiesStore.getErrorMessage(propertyId);
	}

	/**
	*	Used to return all error messages.  Will either return internally stored messages
	* or formatted list to store in pipeline-flow
	* @param filteredPipeline boolean
	* @return object when filteredPipeline=false or array when filteredPipeline=true
	*/
	getErrorMessages(filteredPipeline) {
		const messages = this.propertiesStore.getErrorMessages();
		if (filteredPipeline) {
			const pipelineMessages = [];
			for (const paramKey in messages) {
				if (!messages.hasOwnProperty(paramKey)) {
					continue;
				}
				const paramMessage = this.getErrorMessage({ name: paramKey });
				if (paramMessage && paramMessage.text) {
					pipelineMessages.push({
						id_ref: paramKey,
						validation_id: paramMessage.validation_id,
						type: paramMessage.type,
						text: paramMessage.text
					});
				}
			}
			return pipelineMessages;
		}
		return messages;
	}
	updateErrorMessage(inPropertyId, message) {
		const propertyId = this.convertPropertyId(inPropertyId);
		if (message && message.type !== "info") {
			this.propertiesStore.updateErrorMessage(propertyId, message);
		} else {
			this.propertiesStore.clearErrorMessage(propertyId);
		}
	}

	removeErrorMessageRow(inPropertyId) {
		const propertyId = this.convertPropertyId(inPropertyId);
		let messages = this.propertiesStore.getErrorMessages();
		const controlMsg = messages[propertyId.name];
		if (typeof controlMsg !== "undefined") {
			for (const rowIndex of Object.keys(controlMsg)) {
				const rowNumber = parseInt(rowIndex, 10);
				if (rowNumber === propertyId.row) {
					delete messages[propertyId.name][rowNumber];
				} else if (rowNumber > propertyId.row) {
					messages = this._moveMessageRows(messages, propertyId.name, rowNumber, rowNumber - 1);
				}
			}
			this.setErrorMessages(messages);
		}
	}

	moveErrorMessageRows(controlName, firstRow, secondRow) {
		let messages = this.propertiesStore.getErrorMessages();
		const controlMsg = messages[controlName];
		if (typeof controlMsg !== "undefined") {
			const firstRowErrorMsg = controlMsg[firstRow];
			const secondRowErrorMsg = controlMsg[secondRow];
			if (typeof firstRowErrorMsg !== "undefined" && typeof secondRowErrorMsg !== "undefined") {
				messages = this._moveMessageRows(messages, controlName, firstRow, secondRow);
				// create second message because it is deleted in the changeErrorMessageRow, set it to first row number
				messages[controlName][firstRow] = {};
				for (const colNumber of Object.keys(secondRowErrorMsg)) {
					messages[controlName][firstRow][colNumber] = secondRowErrorMsg[colNumber];
				}
			} else if (typeof firstRowErrorMsg !== "undefined") {
				messages = this._moveMessageRows(messages, controlName, firstRow, secondRow);
			} else if (typeof secondRowErrorMsg !== "undefined") {
				messages = this._moveMessageRows(messages, controlName, secondRow, firstRow);
			}
			this.setErrorMessages(messages);
		}
	}

	_moveMessageRows(messages, controlName, fromRow, toRow) {
		messages[controlName][toRow] = messages[controlName][fromRow];
		delete messages[controlName][fromRow];
		return messages;
	}

	/*
	* Controls Methods
	*/

	// Saves controls in a state that get be used to retrieve them using a propertyId
	saveControls(controls) {
		controls.forEach((control) => {
			if (typeof control.columnIndex === "undefined") {
				this.controls[control.name] = control;
			} else {
				this.controls[control.parameterName][control.columnIndex] = control;
			}
		});
	}

	getControl(propertyId) {
		let control = this.controls[propertyId.name];
		// custom control doesn't have any subcontrols so default to parent
		if (typeof propertyId.col !== "undefined" && control && control.controlType !== ControlType.CUSTOM) {
			control = this.controls[propertyId.name][propertyId.col.toString()];
		}
		return control;
	}

	getRequiredParameters() {
		return this.requiredParameters;
	}

	isRequired(propertyId) {
		const control = this.getControl(propertyId);
		if (control) {
			const required = control.required;
			return (required) ? required : false;
		}
		return false;
	}

	isSummary(propertyId) {
		const control = this.getControl(propertyId);
		if (control) {
			const summary = control.summary;
			return (summary) ? summary : false;
		}
		return false;
	}

	getControlType(propertyId) {
		const control = this.getControl(propertyId);
		if (control) {
			return control.controlType;
		}
		return null;
	}

	/*
	* Summary Panel controls Methods
	*/
	_parseSummaryControls(controls) {
		const summaryControls = {};
		controls.forEach((control) => {
			if (control.summaryPanelId) {
				if (typeof summaryControls[control.summaryPanelId] === "undefined") {
					summaryControls[control.summaryPanelId] = [];
				}
				if (typeof control.columnIndex === "undefined") {
					summaryControls[control.summaryPanelId].push(control.name);
				}
			}
		});
		this.setSummaryPanelControls(summaryControls);
	}
	setSummaryPanelControls(summaryPanelControls) {
		this.summaryPanelControls = summaryPanelControls;
	}
	getSummaryPanelControls(panelId) {
		return this.summaryPanelControls[panelId];
	}
	// Sets the value to be displayed in the summaryPanel for a customPanel property
	updateCustPropSumPanelValue(propertyId, content) {
		if (typeof propertyId.name !== "undefined") {
			this.custPropSumPanelValues[propertyId.name] = content;
		}
	}
	getCustPropSumPanelValue(propertyId) {
		// don't display hidden or disabled parameters
		const controlState = this.getControlState(propertyId);
		if (controlState === STATES.DISABLED || controlState === STATES.HIDDEN) {
			return null;
		}
		return this.custPropSumPanelValues[propertyId.name];
	}
	// Only used in custom panel to allow for custom property summary values to be displayed
	setControlInSummary(propertyId, label, inSummary) {
		const control = this.getControl(propertyId);
		if (control) {
			control.summary = true;
			control.summaryLabel = label;
		}
	}

	/**
	* Used to create standard controls in customPanels
	* @param propertyId - Property id of the controls
	* @param paramDef - schema definition.  See paramDef schema
	* @param parameter (string) - name of the parameter to pull out of paramDef
	*/
	createControl(propertyId, paramDef, parameter) {
		const control = this.controlFactory.createFormControl(paramDef, parameter);
		const controls = [];
		// need to preserve parentCategoryId which is set during initial parsing of all controls
		const parentCategoryId = this.getControl(propertyId).parentCategoryId;
		UiConditionsParser.parseControl(controls, control, parentCategoryId);
		this.saveControls(controls);
		return this.controlFactory.createControlItem(control, propertyId);
	}

	/**
	* Used to create controls
	* @return the controlFactory instance
	*/
	getControlFactory() {
		return this.controlFactory;
	}

	/**
	* Sets the custom controls available to common-properties
	* @param customControls
	*/
	setCustomControls(customControls) {
		this.customControls = customControls;
	}

	/**
	* Returns a rendered custom control
	* @param propertyId
	* @param control
	* @param tableInfo
	*/
	getCustomControl(propertyId, control, tableInfo) {
		if (control.customControlId) {
			for (const customCtrl of this.customControls) {
				if (customCtrl.id() === control.customControlId) {
					try {
						return new customCtrl(propertyId, this, control.data, tableInfo).renderControl();
					} catch (error) {
						logger.warn("Error thrown creating custom control: " + error);
						return "";
					}
				}
			}
		}
		return "Custom control not found: " + control.customControlId;
	}
}
