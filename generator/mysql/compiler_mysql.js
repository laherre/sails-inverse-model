/**
 * compiler_mysql.js
 * 2016
 *
 * Process mysql to models waterline
 */
var mysqldesc = require('mysqldesc');
var s = require("underscore.string");

var to = require('../../configs/to');
var view = require('../../genviews/view');
var async = require("async");

require('../save');
require('../../configs/color');

var FK_IDENTIFIER = "id";

exports.generate = function(config, folder_models, folder_controllers, folder_views, tables) {
  // Describe connected database
  mysqldesc(config, function(err, data) {
    if (err) {
      console.log("ERROR: ", err);
    } else {
      var Models = [],
        count = 1;
      async.forEachOf(data, function(value, table, callback) {
        if ( (tables === 'undefined' || tables.split(",").indexOf(table) != -1)
            && data.hasOwnProperty(table)) {
          console.log(color("[" + (count++) + " Generating]", "blue") + " " + table + " table ...");

          var attributes_sails = [],
            view_contents = [];
          mysqldesc.keyColumnUsage(config, config.database, table, function(err, data2) {
            for (var colum in data[table]) {
              //console.log(table + "=>" + colum);
              var reference_fk = undefined;
              if (data2[colum] && data2[colum]["REFERENCED_TABLE_NAME"]) {
                reference_fk = {
                  table: data2[colum].REFERENCED_TABLE_NAME,
                  column: data2[colum].REFERENCED_COLUMN_NAME
                };
                //console.log(table + "=>" + JSON.stringify(data2[colum], null, 4));
              }
              var attributes = data[table][colum];
              //console.log(attributes);
              var result = transpile(attributes, colum, reference_fk);
              view_contents.push(result.view_content);
              attributes_sails.push(result.model_content);
            }
            //console.log("-------------");
            Models.push({
              model_name: s.camelize(table).trim(),
              content: "attributes: { " + attributes_sails + " }",
              view_content: view_contents
            });
            //console.log(table + " = " + JSON.stringify(table, null, 4));
            callback(null, table);
          });
        }
      }, function(err) {
        console.log([Models.length, "tables"].join(" "));

        //console.log(Models);
        if (folder_views !== "" && folder_views) {
          view.generate(Models, folder_views);
        }
        if (folder_models !== "" && folder_models) {
          saveModels(folder_models, Models);
        }
        if (folder_controllers !== "" && folder_controllers) {
          saveControllers(folder_controllers, Models);
        }
      });
    }
  });
};

/**
 * [transpile: convert all attributes mysql to orm sailsjs]
 * @param  {[type]} attributes     	[description]
 * @param  {[type]} name_attribute 	[description]
 * @param  {[type]} reference_fk 	  [description]
 * @return {[type]}                	[description]
 */
function transpile(attributes, name_attribute, reference_fk) {
  //console.log("attributes " + JSON.stringify(attributes, null, 4));
  var type_ = attributes["Type"];
  var default_value_ = attributes["Default"];
  var is_nullable_ = attributes["Null"];
  var key_ = attributes["Key"];

  //console.log(JSON.stringify(attributes));
  return exports.toSailsAttribute(type_, name_attribute, default_value_, is_nullable_, key_, reference_fk);
}

exports.toSailsAttribute = function(Type, attrib, default_value_, is_nullable_, key_, reference_fk) {
  var content_view = {
    required: false,
    default_value: default_value_,
    name: attrib,
    type: undefined
  };

  //console.log(attrib);
  var attribute = [];

  Type = Type.toLowerCase();

  if (Type.indexOf('varchar') > -1 ||
    Type.indexOf('time') > -1) {
    attribute.push(getString(Type));
    content_view.type = "text";
  } else if (Type.indexOf('int') > -1 ||
    Type.indexOf('small') > -1) { //Include smallint
    attribute.push(getInteger(Type));
    content_view.type = "number";
  } else if (Type.indexOf('bool') > -1 ||
    Type.indexOf('bit') > -1) {
    attribute.push(getBoolean());
    content_view.type = "checkbox";
  } else if (Type.indexOf('float') > -1 ||
    Type.indexOf('dec') > -1 || //Include decimal
    Type.indexOf('numeric') > -1 ||
    Type.indexOf('real') > -1 ||
    Type.indexOf('precicion') > -1) {
    attribute.push(getFloat());
    content_view.type = "number";
  } else if (Type.indexOf('enum') > -1) {
    attribute.push(getEnum(Type));
    content_view.type = "text";
  } else if (Type.indexOf('text') > -1) {
    attribute.push(getText());
    content_view.type = "text";
  } else if (Type.indexOf('datetime') > -1) {
    attribute.push(getDateTime());
    content_view.type = "datetime";
  } else if (Type.indexOf('date') > -1 ||
    Type.indexOf('year') > -1) {
    attribute.push(getDate());
    content_view.type = "date";
  }
  if (key_ === "PRI") {
    attribute.push(getPK());
    content_view.required = true;
  } else if (key_ === "MUL") {
    if (reference_fk) {
      attrib = attrib.replace(FK_IDENTIFIER, "");
      //attrib = reference_fk.table;
      //attribute.push('model: ' + reference_fk.table);
      attribute = ['model: "' + reference_fk.table + '"'];
    }
  } else if (key_ === "UNI") {
    attribute.push(getUnique());
  }
  if (is_nullable_ === "NO") {
    attribute.push(getRequired());
    content_view.required = true;
  }
  if (default_value_ !== "" && !default_value_ && default_value_ !== null) {
    var def = "defaultsTo: ";
    if (content_view.type == "text") {
      def += '"' + default_value_ + '"';
    } else {
      def += default_value_;
    }
    attribute.push(def);
  }

  var result = {
    model_content: attrib.toLowerCase() + ": {" + attribute.join(',') + "}",
    view_content: JSON.stringify(content_view)
  };
  return result;
};

function getPK() {
  return "primaryKey: true";
}

function getRequired() {
  return "required: true";
}

function getUnique() {
  return "unique: true";
}

function getString(Type) {
  var out = [];
  var attr_aux = Type.toLowerCase().split(/[(*)]/);
  out.push('type: "string"');
  if (attr_aux[1]) {
    out.push("size: " + parseInt(attr_aux[1]));
  }
  return quitComma(out.join(","));
}

function getInteger(Type) {
  var out = [];
  var attr_aux = Type.toLowerCase().split(/[(*)]/);
  out.push('type: "integer"');
  if (attr_aux[1]) {
    out.push("size: " + parseInt(attr_aux[1]));
  }
  return quitComma(out.join(","));
}

function getFloat() {
  return 'type: "float"';
}

function getBoolean() {
  return 'type: "binary"';
}

function getText() {
  return 'type: "text"';
}

function getDate() {
  return 'type: "date"';
}

function getDateTime() {
  return 'type: "datetime"';
}

// TODO: Mejorar la detección de items con una expresion regular
function getEnum(Type) {
  var out = [];
  var pa1 = Type.indexOf('(');
  var pa2 = Type.indexOf(')');

  pa1++;
  var line = Type.substring(pa1, pa2).replace(",", "").split('\'');
  //console.log(pa1 + ", " + pa2);
  line.map((item) => {
    if (item !== "") {
      out.push('"' + item + '"');
    }
  });
  //out.push("required: true");
  return "enum: [" + quitComma(out.join(",")) + "]";
}

function quitComma(str) {
  if (str.trim().endsWith(",")) {
    return str.trim().substr(0, str.length - 1);
  }
  return str;
}

exports.quitComma = quitComma;
