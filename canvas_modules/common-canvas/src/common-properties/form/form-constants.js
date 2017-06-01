/*******************************************************************************
 * Licensed Materials - Property of IBM
 * (c) Copyright IBM Corporation 2017. All Rights Reserved.
 *
 * Note to U.S. Government Users Restricted Rights:
 * Use, duplication or disclosure restricted by GSA ADP Schedule
 * Contract with IBM Corp.
 *******************************************************************************/

const ItemType = {
	CONTROL: "control",
	ADDITIONAL_LINK: "additionalLink",
	STATIC_TEXT: "staticText",
	HORIZONTAL_SEPARATOR: "hSeparator",
	PANEL: "panel",
	SUB_TABS: "subTabs",
	PRIMARY_TABS: "primaryTabs",
	PANEL_SELECTOR: "panelSelector"
};

const EditStyle = {
	INLINE: "inline",
	SUBPANEL: "subpanel"
};

const Size = {
	LARGE: "large",
	MEDIUM: "medium",
	SMALL: "small"
};

const GroupType = {
	CONTROLS: "controls",
	TABS: "tabs",
	SUB_TABS: "subTabs",
	PANELS: "panels",
	ADDITIONAL: "additional",
	COLUMN_ALLOCATION: "columnAllocation",
	PANEL_SELECTOR: "panelSelector"
};

const PanelType = {
	GENERAL: "general",
	COLUMN_ALLOCATION: "columnAllocation"
};

const ControlType = {
	CUSTOM: "custom",
	TEXTFIELD: "textfield",
	PASSWORDFIELD: "passwordfield",
	TEXTAREA: "textarea",
	EXPRESSION: "expression",
	NUMBERFIELD: "numberfield",
	CHECKBOX: "checkbox",
	RADIOSET: "radioset",
	CHECKBOXSET: "checkboxset",
	ONEOFSELECT: "oneofselect",
	SOMEOFSELECT: "someofselect",
	ONEOFCOLUMNS: "oneofcolumns",
	SOMEOFCOLUMNS: "someofcolumns",
	ALLOCATEDCOLUMN: "allocatedcolumn",
	ALLOCATEDCOLUMNS: "allocatedcolumns",
	ALLOCATEDSTRUCTURES: "allocatedstructures",
	STRUCTUREEDITOR: "structureeditor",
	STRUCTURELISTEDITOR: "structurelisteditor"
};

const ParamRole = {
	TEXT: "text",
	ENUM: "enum",
	COLUMN: "column",
	NEW_COLUMN: "new_column",
	EXPRESSION: "expression",
	EMAIL: "email",
	URL: "url",
	COLOR: "color",
	INTERVAL_YEAR: "interval_year",
	INTERVAL_DAY: "interval_day",
	INTERVAL_SECOND: "interval_second",
	CUSTOM: "custom",
	UNSPECIFIED: ""
};

const Type = {
	BOOLEAN: "boolean",
	INTEGER: "integer",
	LONG: "long",
	DOUBLE: "double",
	STRING: "string",
	PASSWORD: "password",
	DATE: "date",
	STRUCTURE: "structure"
};

function hasValue(Enum, value) {
	for (var key in Enum) {
		if (value === Enum[key]) {
			return true;
		}
	}
	return false;
}

export { GroupType, PanelType, Type, ParamRole, ControlType, hasValue, EditStyle, Size, ItemType };