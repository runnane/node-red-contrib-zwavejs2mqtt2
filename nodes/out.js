const zwavejs2mqtt2helper = require('../lib/zwavejs2mqtt2helper.js');
var mqtt = require('mqtt');

module.exports = function(RED) {
    class zwavejs2mqtt2NodeOut {
        constructor(config) {
            RED.nodes.createNode(this, config);

            var node = this;
            node.config = config;
            node.cleanTimer = null;
            node.server = RED.nodes.getNode(node.config.server);

            if (node.server) {
                node.status({}); //clean

                node.on('input', function(message) {
                    clearTimeout(node.cleanTimer);

                    if (node.config.device_id) {
                        var payload;
                        var options = {};
                        var commandClass;
                        switch (node.config.payloadType) {
                            case 'flow':
                            case 'global': {
                                RED.util.evaluateNodeProperty(node.config.payload, node.config.payloadType, this, message, function (error, result) {
                                    if (error) {
                                        node.error(error, message);
                                    } else {
                                        payload = result;
                                    }
                                });
                                break;
                            }
                            // case 'date': {
                            //     payload = Date.now();
                            //     break;
                            // }

                            case 'num': {
                                payload = parseInt(node.config.payload);
                                break;
                            }

                            case 'str': {
                                payload = node.config.payload;
                                break;
                            }

                            case 'json': {
                                if (zwavejs2mqtt2helper.isJson(node.config.payload)) {
                                    payload = JSON.parse(node.config.payload);
                                } else {
                                    node.warn('Incorrect payload. Waiting for valid JSON');
                                    node.status({
                                        fill: "red",
                                        shape: "dot",
                                        text: "node-red-contrib-zwavejs2mqtt2/out:status.no_payload"
                                    });
                                    node.cleanTimer = setTimeout(function(){
                                        node.status({}); //clean
                                    }, 3000);
                                }
                                break;
                            }

                            
                            case 'msg':
                            default: {
                                payload = message[node.config.payload];
                                break;
                            }
                        }

                        switch (node.config.commandClassType) {
                            case 'flow':
                            case 'global': {
                                RED.util.evaluateNodeProperty(node.config.commandClass, node.config.commandClassType, this, message, function (error, result) {
                                    if (error) {
                                        node.error(error, message);
                                    } else {
                                        commandClass = result;
                                    }
                                });
                                break;
                            }

                            case 'num': {
                                commandClass = parseInt(node.config.commandClass);
                                break;
                            }

                            case 'str': {
                                commandClass = node.config.commandClass;
                                break;
                            }

                            case 'json': {
                                if (zwavejs2mqtt2helper.isJson(node.config.commandClass)) {
                                    commandClass = JSON.parse(node.config.commandClass);
                                } else {
                                    node.warn('Incorrect commandClass. Waiting for valid JSON');
                                    node.status({
                                        fill: "red",
                                        shape: "dot",
                                        text: "node-red-contrib-zwavejs2mqtt2/out:status.no_payload"
                                    });
                                    node.cleanTimer = setTimeout(function(){
                                        node.status({}); //clean
                                    }, 3000);
                                }
                                break;
                            }

                            
                            case 'msg':
                            default: {
                                commandClass = message[node.config.commandClass];
                                break;
                            }
                        }

                        // Default 0. Might be set to empty which will resolve as NaN.
                        const transition = parseInt(node.config.transition)

                        var command;
                        switch (node.config.commandType) {
                            case 'msg': {
                                command = message[node.config.command];
                                break;
                            }
                            case 'json':
                                break;

                            case 'str':
                            default: {
                                command = node.config.command;
                                break;
                            }
                        }

                        //empty payload, stop
                        if (payload === null) {
                            return false;
                        }

                        if (payload !== undefined) {

                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: payload.toString()
                            });

                            node.cleanTimer = setTimeout(function(){
                                node.status({}); //clean
                            }, 3000);
                          
                            var text = '';

                            if (typeof(payload) == 'object') {
                                text = 'json';
                            } else {
                                text = command + ': ' + payload;
                            }

                            const mqtttopic = node.server.getBaseTopic() + "/_CLIENTS/ZWAVE_GATEWAY-"+node.server.getServerName()+"/api/writeValue/set";
                            const args = {
                                args: [
                                    {
                                        nodeId:parseInt(node.config.device_id),
                                        commandClass:commandClass,
                                        endPoint:0,
                                        property:command
                                    },
                                    payload
                                ]
                                
                            };
                            
                            node.log('Published to mqtt topic: ' + mqtttopic + ' : ' + JSON.stringify(args));
                            node.server.mqtt.publish(mqtttopic, JSON.stringify(args));

                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: text
                            });
                            node.cleanTimer = setTimeout(function(){
                                node.status({}); //clean
                            }, 3000);
                        } else {
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "node-red-contrib-zwavejs2mqtt2/out:status.no_payload"
                            });
                        }
                    } else {
                        node.status({
                            fill: "red",
                            shape: "dot",
                            text: "node-red-contrib-zwavejs2mqtt2/out:status.no_device"
                        });
                    }
                });

            } else {
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "node-red-contrib-zwavejs2mqtt2/out:status.no_server"
                });
            }
        }

        
    }


    RED.nodes.registerType('zwavejs2mqtt2-out', zwavejs2mqtt2NodeOut);
};






