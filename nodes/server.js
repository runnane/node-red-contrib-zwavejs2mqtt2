const zwavejs2mqtt2helper = require('../lib/zwavejs2mqtt2helper.js');
var mqtt = require('mqtt');

module.exports = function (RED) {
    class ServerNode{
        constructor(n) {
            RED.nodes.createNode(this, n);

            var node = this;
            node.config = n;
            node.connection = false;
            node.topic = node.config.base_topic+'/#';
            node.mqtt_name = node.config.base_mqtt_name;
            node.items = undefined;
            node.groups = undefined;
            node.devices = undefined;
            node.devices_values = [];
            node.bridge_config = null;
            node.bridge_state = null;
            node.map = null;
            node.on('close', () => this.onClose());
            node.setMaxListeners(0);

            //mqtt
            node.mqtt = node.connectMQTT();
            node.mqtt.on('connect', () => this.onMQTTConnect());
            node.mqtt.on('message', (topic, message) => this.onMQTTMessage(topic, message));

            node.mqtt.on('close', () => this.onMQTTClose());
            node.mqtt.on('end', () => this.onMQTTEnd());
            node.mqtt.on('reconnect', () => this.onMQTTReconnect());
            node.mqtt.on('offline', () => this.onMQTTOffline());
            node.mqtt.on('disconnect', (error) => this.onMQTTDisconnect(error));
            node.mqtt.on('error', (error) => this.onMQTTError(error));

            // console.log(node.config._users);
        }

        connectMQTT(clientId = null) {
            var node = this;
            var options = {
                port: node.config.mqtt_port||1883,
                username: node.config.mqtt_username||null,
                password: node.config.mqtt_password||null,
                clientId:"NodeRed-"+node.id+(clientId?"-"+clientId:"")
            };

            let baseUrl='mqtt://';

            var tlsNode = RED.nodes.getNode(node.config.tls);
            if (node.config.usetls && tlsNode) {
                tlsNode.addTLSOptions(options);
                baseUrl='mqtts://';
            }

            return mqtt.connect( baseUrl + node.config.host, options);
        }


        subscribeMQTT() {
            var node = this;
            node.mqtt.subscribe(node.topic, function (err) {
                if (err) {
                    node.warn('MQTT Error: Subscribe to "' + node.topic);
                    node.emit('onConnectError', err);
                } else {
                    node.log('MQTT Subscribed to: "' + node.topic);
                }
            })
        }

        unsubscribeMQTT() {
            var node = this;
            node.log('MQTT Unsubscribe from mqtt topic: ' + node.topic);
            node.mqtt.unsubscribe(node.topic, function (err) {});
            node.devices_values = [];
        }

        getDevices(callback, forceRefresh = false, withGroups = false) {
            var node = this;

            if (forceRefresh || node.devices === undefined) {
                node.log('Refreshing devices');
                node.groups = [];

                var timeout = null;
                var timeout_ms = 5000;


                var client = node.connectMQTT('tmp');
                client.on('connect', function () {

                    //end function after timeout, if now response
                    timeout = setTimeout(function(){
                        client.end(true);
                    }, timeout_ms);

                    client.subscribe(node.topic, function (err) {
                        if (!err) {
                            const args = { args: [] };
                           
                            client.publish(node.getBaseTopic() + "/_CLIENTS/ZWAVE_GATEWAY-"+node.getServerName()+"/api/getNodes/set", JSON.stringify(args));
                           
                        } else {
                            RED.log.error("zwavejs2mqtt2: error code #0023: " + err);
                            client.end(true);
                        }
                    })
                });

                client.on('error', function (error) {
                    RED.log.error("zwavejs2mqtt2: error code #0024: " + error);
                    client.end(true);
                });

                client.on('end', function (error, s) {
                    // console.log('END');
                    clearTimeout(timeout);

                    if (typeof (callback) === "function") {
                        callback(withGroups?[node.devices, node.groups]:node.devices);
                    }
                    return withGroups?[node.devices, node.groups]:node.devices;
                });

                client.on('message', function (topic, message) {

                    //node.log("got message in " + topic);
                    /*
                    if (node.getBaseTopic() + "/bridge/state" == topic) {
                        node.bridge_state = message.toString();
                        if (message.toString() != "online") {
                            RED.log.error("zwavejs2mqtt2: bridge status: " + message.toString());
                        }

                    } else if (node.getBaseTopic()+'/bridge/log' == topic) {
                        var messageString = message.toString();
                        if (zwavejs2mqtt2helper.isJson(messageString)) {
                            var payload = JSON.parse(messageString);
                            if ("type" in payload) {
                                if ("groups" == payload.type) {
                                    node.groups = payload.message;
                                }
                            }
                        }

                    } else if (node.getBaseTopic()+'/bridge/config' == topic) {
                        node.bridge_config = JSON.parse(message.toString());

                    } else */
                   /* if(topic.match(/api/)){
                        node.log(topic);
                        node.log(message);
                        node.log(message.toString());
                    }
                    */
                    if (node.getBaseTopic() + "/_CLIENTS/ZWAVE_GATEWAY-" + node.getServerName() + "/api/getNodes" == topic) {
                       // node.log(message);
                       // node.log(message.toString());
                        //console.log(JSON.parse(message.toString()));
                        node.devices = (JSON.parse(message.toString())).result;
                        //console.log(node.devices);
                        
                        client.end(true);
                    }
                    
                })
            } else {
                // console.log(node.devices);
                node.log('Using cached devices');
                if (typeof (callback) === "function") {
                    callback(withGroups?[node.devices, node.groups]:node.devices);
                }
                return withGroups?[node.devices, node.groups]:node.devices;
            }
        }


        getDeviceById(id) {
            var node = this;
            var result = null;
            for (var i in node.devices) {
                if (id == node.devices[i]['id']) {
                    result = node.devices[i];
                    result['lastPayload'] = {};

                    var topic =  node.getBaseTopic()+'/'+(node.devices[i]['name']?node.devices[i]['name']:node.devices[i]['id']);
                    
                    break;
                }
            }
            return result;
        }

        getGroupById(id) {
            var node = this;
            var result = null;
            for (var i in node.groups) {
                if (id == node.groups[i]['ID']) {
                    result = node.groups[i];
                    result['lastPayload'] = {};

                    var topic =  node.getBaseTopic()+'/'+(node.groups[i]['name']?node.groups[i]['friendly_name']:node.groups[i]['ID']);
               
                    break;
                }
            }
            return result;
        }

        getLastStateById(id) {
            var node = this;
            var device = node.getDeviceById(id);
            if (device) {
                return device;
            }
            var group = node.getGroupById(id);
            if (group) {
                return group;
            }
            return {};
        }

        getDeviceByTopic(topic) {
            var node = this;
            var result = null;
            for (var i in node.devices) {
                if (topic == node.getBaseTopic()+'/'+node.devices[i]['name']
                    || topic == node.getBaseTopic()+'/'+node.devices[i]['id']) {
                    result = node.devices[i];
                    break;
                }
            }
            return result;
        }

        getGroupByTopic(topic) {
            var node = this;
            var result = null;
            for (var i in node.groups) {
                if (topic == node.getBaseTopic()+'/'+node.groups[i]['friendly_name']
                    || topic == node.getBaseTopic()+'/'+node.groups[i]['id']) {
                    result = node.groups[i];
                    break;
                }
            }
            return result;
        }

        getBaseTopic() {
            return this.config.base_topic;
        }

        getServerName() {
            return this.config.base_mqtt_name;
        }

        setLogLevel(val) {
            var node = this;
            if (['info', 'debug', 'warn', 'error'].indexOf(val) < 0) val = 'info';
          //  node.mqtt.publish(node.getBaseTopic() + "/bridge/config/log_level", val);
            node.log('Log Level set to: '+val);
        }

        setPermitJoin(val) {
            var node = this;
            val = val?"true":"false";
          //  node.mqtt.publish(node.getBaseTopic() + "/bridge/config/permit_join", val);
            node.log('Permit Join set to: '+val);
        }

        renameDevice(ieeeAddr, newName) {
            var node = this;
/*
            var device = node.getDeviceById(ieeeAddr);
            if (!device) {
                return {"error":true,"description":"no such device"};
            }

            if (!newName.length)  {
                return {"error":true,"description":"can not be empty"};
            }

            var payload = {
                "old":device.friendly_name,
                "new":newName
            };

            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/rename", JSON.stringify(payload));
            node.log('Rename device '+ieeeAddr+' to '+newName);
*/
            return {"success":true,"description":"command sent"};
        }

        removeDevice(ieeeAddr) {
            var node = this;
/*
            var device = node.getDeviceById(ieeeAddr);
            if (!device) {
                return {"error":true,"description":"no such device"};
            }

            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/force_remove", device.friendly_name);
            node.log('Remove device: '+device.friendly_name);
*/
            return {"success":true,"description":"command sent"};
        }

        setDeviceOptions(friendly_name, options) {
            var node = this;
            //
            // var device = node.getDeviceById(ieeeAddr);
            // if (!device) {
            //     return {"error":true,"description":"no such device"};
            // }

            var payload = {};
            payload['friendly_name'] = friendly_name;
            payload['options'] = options;

/*
            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/device_options", JSON.stringify(payload));
            node.log('Set device options: '+JSON.stringify(payload));
*/
            return {"success":true,"description":"command sent"};
        }


        renameGroup(id, newName) {
            var node = this;

            var group = node.getGroupById(id);
            if (!group) {
                return {"error":true,"description":"no such group"};
            }

            if (!newName.length)  {
                return {"error":true,"description":"can not be empty"};
            }

            var payload = {
                "old":group.friendly_name,
                "new":newName
            };
/*
            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/rename", JSON.stringify(payload));
            node.log('Rename group '+id+' to '+newName);
*/
            return {"success":true,"description":"command sent"};
        }

        removeGroup(id) {
            var node = this;

            var group = node.getGroupById(id);
            if (!group) {
                return {"error":true,"description":"no such group"};
            }
/*
            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/remove_group", group.friendly_name);
            node.log('Remove group: '+group.friendly_name);
*/
            return {"success":true,"description":"command sent"};
        }

        addGroup(name) {
            var node = this;
/*
            node.mqtt.publish(node.getBaseTopic() + "/bridge/config/add_group", name);
            node.log('Add group: '+name);
*/
            return {"success":true,"description":"command sent"};
        }


        removeDeviceFromGroup(deviceId, groupId) {
            var node = this;

            var device = node.getDeviceById(deviceId);
            if (!device) {
                device = {"friendly_name":deviceId};
            }

            var group = node.getGroupById(groupId);
            if (!group) {
                return {"error":true,"description":"no such group"};
            }

/*            node.mqtt.publish(node.getBaseTopic() + "/bridge/group/"+group.friendly_name+"/remove", device.friendly_name);
            node.log('Removing device: '+device.friendly_name  + ' from group: '+group.friendly_name);
*/
            return {"success":true,"description":"command sent"};
        }


        addDeviceToGroup(deviceId, groupId) {
            var node = this;


            var device = node.getDeviceById(deviceId);
            if (!device) {
                return {"error":true,"description":"no such device"};
            }

            var group = node.getGroupById(groupId);
            if (!group) {
                return {"error":true,"description":"no such group"};
            }
/*
            node.mqtt.publish(node.getBaseTopic() + "/bridge/group/"+group.friendly_name+"/add", device.friendly_name);
            node.log('Adding device: '+device.friendly_name+ ' to group: '+group.friendly_name);
*/
            return {"success":true,"description":"command sent"};
        }



        

        onMQTTConnect() {
            var node = this;
            node.connection = true;
            node.log('MQTT Connected');
            node.emit('onMQTTConnect');
            node.getDevices(function(){
                node.subscribeMQTT();
            });

        }

        onMQTTDisconnect(error) {
            var node = this;
            // node.connection = true;
            node.log('MQTT Disconnected');
            console.log(error);

        }

        onMQTTError(error) {
            var node = this;
            // node.connection = true;
            node.log('MQTT Error');
            console.log(error);

        }

        onMQTTOffline() {
            var node = this;
            // node.connection = true;
            node.log('MQTT Offline');
            console.log("MQTT OFFLINE");

        }

        onMQTTEnd() {
            var node = this;
            // node.connection = true;
            node.log('MQTT End');
            // console.log();

        }

        onMQTTReconnect() {
            var node = this;
            // node.connection = true;
            node.log('MQTT Reconnect');
            // console.log();

        }

        onMQTTClose() {
            var node = this;
            // node.connection = true;
            node.log('MQTT Close');
            // console.log(node.connection);

        }

        onMQTTMessage(topic, message) {
            var node = this;
            var messageString = message.toString();
            
            if (node.getBaseTopic() + "/_EVENTS/ZWAVE_GATEWAY-" + node.getServerName() + "/node/node_value_updated" == topic) {
                //node.log("server.onMQTTMessage()");
                //node.log(topic);
                //node.log(message);

                var payload_json = zwavejs2mqtt2helper.isJson(messageString)?JSON.parse(messageString):messageString;

                //console.log(payload_json);

                //clone object for payload output

                var payload = {};
                Object.assign(payload, payload_json);

                // console.log('==========MQTT START')
                // console.log(topic);
                // console.log(payload_json);
                // console.log('==========MQTT END')
                node.devices_values[topic] = payload_json;
                node.emit('onMQTTMessage', {
                    topic: topic,
                    payload: payload,
                    device: node.getDeviceById(payload_json.data[0].id),
                    //group: node.getGroupByTopic(topic)
                });
                return;
              

            }

            //bridge
            /*
            if (topic.search(new RegExp(node.getBaseTopic()+'\/bridge\/')) === 0) {
                if (node.getBaseTopic() + '/bridge/config/devices' == topic) {
                    node.devices = JSON.parse(messageString);
                } else if (node.getBaseTopic() + '/bridge/state' == topic) {
                    node.emit('onMQTTBridgeState', {
                        topic: topic,
                        payload: message.toString() == "online"
                    });
                    if (message.toString() == "online") {
                        node.getDevices(null, true, true);
                    }
                } else if (node.getBaseTopic()+'/bridge/config' == topic) {
                    node.bridge_config = JSON.parse(message.toString());

                } else if (node.getBaseTopic() + '/bridge/log' == topic) {
                    if (zwavejs2mqtt2helper.isJson(messageString)) {
                        var payload = JSON.parse(messageString);
                        if ("type" in payload) {
                            switch (payload.type) {
                                case "device_renamed":
                                case "device_announced":
                                case "device_removed":
                                case "group_renamed":
                                case "group_removed":
                                    node.getDevices(null, true);
                                break;

                                case "group_added":
                                    node.setDeviceOptions(payload.message, {"retain": true});
                                    node.getDevices(null, true);
                                    break;

                                case "pairing":
                                    if ("interview_successful" == payload.message) {
                                        node.setDeviceOptions(payload.meta.friendly_name, {"retain": true})
                                    }
                                break;
                            }
                        }
                    }
               // } else if (node.getBaseTopic() + '/bridge/networkmap/graphviz' == topic) {
                   // node.graphviz(messageString);
                }


                node.emit('onMQTTMessageBridge', {
                    topic:topic,
                    payload:messageString
                });
            } else { */
                /*
                var payload_json = zwavejs2mqtt2helper.isJson(messageString)?JSON.parse(messageString):messageString;

                //if not /set message
                if (topic.substring(topic.length - 4, topic.length) != '/set') {
                    //clone object for payload output
                    var payload = {};
                    Object.assign(payload, payload_json);
                    // console.log('==========MQTT START')
                    // console.log(topic);
                    // console.log(payload_json);
                    // console.log('==========MQTT END')
                    node.devices_values[topic] = payload_json;
                    node.emit('onMQTTMessage', {
                        topic: topic,
                        payload: payload,
                        device: node.getDeviceById(topic),
                        //group: node.getGroupById(topic)
                    });
                }
                */
         //   }
            
        }

        onClose() {
            var node = this;
            node.unsubscribeMQTT();
            node.mqtt.end();
            node.connection = false;
            node.emit('onClose');
            node.log('MQTT connection closed');
        }
    }

    RED.nodes.registerType('zwavejs2mqtt2-server', ServerNode, {});
};

