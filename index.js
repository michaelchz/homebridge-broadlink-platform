var Accessory, Service, Characteristic;
var broadlink = require('broadlinkjs-sm');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-broadlink-platform", "broadlinkPlatform", broadlinkPlatform);
}

function broadlinkPlatform(log, config, api) {
    this.log = log;
    this.config = config;

    if (api) {
        this.api = api;
    }

}

broadlinkPlatform.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var foundAccessories = this.config.accessories;
        var myAccessories = [];

        for (var i = 0; i < foundAccessories.length; i++) {
            if (foundAccessories[i].type == "MP") {
                for (var a = 1; a <= 4; a++) {
                    foundAccessories[i].sname = "s" + a;
                    var accessory = new BroadlinkAccessory(this.log, foundAccessories[i]);
                    myAccessories.push(accessory);
                    this.log('Created ' + accessory.name + ' ' + accessory.sname + ' Accessory');
                }
            } else if (foundAccessories[i].type == "A1") {
                foundAccessories[i].shared = {b: null, data: null, deadline: 0};

                foundAccessories[i].sname = "s1";
                var accessory = new BroadlinkAccessory(this.log, foundAccessories[i]);
                myAccessories.push(accessory);
                this.log('Created ' + accessory.name + ' ' + accessory.sname + ' Accessory');

                foundAccessories[i].sname = "s2";
                var accessory = new BroadlinkAccessory(this.log, foundAccessories[i]);
                myAccessories.push(accessory);
                this.log('Created ' + accessory.name + ' ' + accessory.sname + ' Accessory');
            } else {
                var accessory = new BroadlinkAccessory(this.log, foundAccessories[i]);
                myAccessories.push(accessory);
                this.log('Created ' + accessory.name + ' Accessory');
            }
        }
        callback(myAccessories);
    }
}

function BroadlinkAccessory(log, config) {
    this.log = log;
    this.config = config;
    this.sname = config.sname || "";
    this.name = config.name + this.sname;
    this.type = config.type || "MP";
    this.ip = config.ip;
    this.mac = config.mac;
    this.powered = false;
    this.local_ip_address = config.local_ip_address;
    this.shared = config.shared;

    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");

    // MAC string to MAC buffer
    this.mac_buff = function(mac) {
        var mb = new Buffer(6);
        if (mac) {
            var values = mac.split(':');
            if (!values || values.length !== 6) {
                throw new Error('Invalid MAC [' + mac + ']; should follow pattern ##:##:##:##:##:##');
            }
            for (var i = 0; i < values.length; ++i) {
                var tmpByte = parseInt(values[i], 16);
                mb.writeUInt8(tmpByte, i);
            }
        } else {
            //this.log("MAC address emtpy, using IP: " + this.ip);
        }
        return mb;
    }
}

BroadlinkAccessory.prototype = {
    getServices: function() {
        var type = this.config.type;
        var services = [];
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink');

        if (type == 'SP') {
            var switchService = new Service.Switch(this.name);
            switchService
                .getCharacteristic(Characteristic.On)
                .on('get', this.getSPState.bind(this))
                .on('set', this.setSPState.bind(this));

            informationService
                .setCharacteristic(Characteristic.Model, 'SP')
                .setCharacteristic(Characteristic.SerialNumber, '1.0');

            services.push(switchService, informationService);

        } else if (type == 'MP') {
            var switchService = new Service.Switch(this.sname);
            switchService
                .getCharacteristic(Characteristic.On)
                .on('get', this.getMPstate.bind(this))
                .on('set', this.setMPstate.bind(this));

            informationService
                .setCharacteristic(Characteristic.Model, 'MP')
                .setCharacteristic(Characteristic.SerialNumber, this.sname);

            services.push(switchService, informationService);

        } else if (type == 'A1') {
        	if (this.sname == 's1') {
                var tempService = new Service.TemperatureSensor(this.name + ' Temperature');;
                tempService
                    .getCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', this.getA1State.bind(this));

                informationService
                    .setCharacteristic(Characteristic.Model, 'A1')
                    .setCharacteristic(Characteristic.SerialNumber, this.sname);

                services.push(tempService, informationService);
        	} else if (this.sname == 's2') {
                var humiService = new Service.HumiditySensor(this.name + ' Humidity');;
                humiService
                    .getCharacteristic(Characteristic.CurrentRelativeHumidity)
                    .on('get', this.getA1State.bind(this));

                informationService
                    .setCharacteristic(Characteristic.Model, 'A1')
                    .setCharacteristic(Characteristic.SerialNumber, this.sname);

                services.push(humiService, informationService);        		
        	}

        }

        return services;
    },

    // b: broadlink
    discover: function(b) {
        b.discover(this.local_ip_address);
    },

    getA1State: function(callback) {
        var self = this;
        var ts = new Date().getTime();

        if (ts > self.shared.deadline && self.shared.b == null) {
            self.shared.b = new broadlink();
            self.shared.b.on("deviceReady", (dev) => {
                if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                    dev.check_sensors();
                    dev.on("all_info", (info) => {
                	    self.shared.data = info;
                         dev.exit();
                         self.shared.deadline = new Date().getTime() + 10000;
                    });

                } else {
                    dev.exit();
                }
            });

            self.discover(self.shared.b);
            var discoverRepeat = 6;
            var discoverTimer = setInterval(function() {
                var ts = new Date().getTime();
                if (ts < self.shared.deadline || discoverRepeat == 0) {
                    clearInterval(discoverTimer);
                    self.shared.b = null;
                } else {
                    checkRepeat--;
                    self.discover(self.shared.b);
                }
            }, 1000);
        }

        var s_index = self.sname;
        if (ts <= self.shared.deadline) {
            var info = (s_index == 's1') ? self.shared.data.temperature : self.shared.data.humidity;
            return callback(null, info);
        } else if (self.shared.b != null) {
            var checkRepeat = 6;
            var checkTimer = setInterval(function() {
                var ts = new Date().getTime();
                if (checkRepeat == 0) {
                    clearInterval(checkTimer);
                } else if (ts < self.shared.deadline) {
                    clearInterval(checkTimer);
                    var info = (s_index == 's1') ? self.shared.data.temperature : self.shared.data.humidity;
                    return callback(null, info);
                } else {
                    checkRepeat--;
                }
            }, 1000);
            return;
        }


    },

    getSPState: function(callback) {
        var self = this;
        var b = new broadlink();
        self.discover(b);

        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                dev.check_power();
                dev.on("power", (pwr) => {
                    self.log(self.name + self.sname + " power is on - " + pwr);
                    dev.exit();
                    clearInterval(checkAgainSP)
                    try {
                        if (!pwr) {
                            self.powered = false;
                            return callback(null, false);
                        } else {
                            self.powered = true;
                            return callback(null, true);
                        }
                    } catch (e) {
                    	// avoid multiple callback
                    }
                });
            } else {
                dev.exit();
            }
        });
        var checkAgainSP = setInterval(function() {
            self.discover(b);
        }, 1000)

    },

    setSPState: function(state, callback) {
        var self = this;
        var b = new broadlink();
        self.discover(b);

        self.log("set SP state: " + state);
        if (state) {
            if (self.powered) {
                return callback(null, true)
            } else {
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log("ON!");
                        dev.set_power(true);
                        dev.exit();
                        clearInterval(checkAgainSPset)
                        self.powered = true;
                        return callback(null, true);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSPset = setInterval(function() {
                    self.discover(b);
                }, 1000)
            }
        } else {
            if (self.powered) {
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log("OFF!");
                        dev.set_power(false);
                        dev.exit();
                        clearInterval(checkAgainSPset)
                        self.powered = false;
                        return callback(null, false);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSPset = setInterval(function() {
                    self.discover(b);
                }, 1000)
            } else {
                return callback(null, false)
            }
        }
    },

    getMPstate: function(callback) {
        var self = this;
        var b = new broadlink();
        var s_index = self.sname[1];
        self.log("checking status for " + self.name);
        self.discover(b);
        b.on("deviceReady", (dev) => {
            //self.log("detected device type:" + dev.type + " @ " + dev.host.address);
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                //self.log("deviceReady for " + self.name);
                dev.check_power();
                dev.on("mp_power", (status_array) => {
                    //self.log("Status is ready for " + self.name);
                    self.log(self.name + " power is on - " + status_array[s_index - 1]);
                    dev.exit();
                    //self.log("MP1 Exited for " + self.sname);
                    clearInterval(checkAgain);
                    if (!status_array[s_index - 1]) {
                        self.powered = false;
                        return callback(null, false);
                    } else {
                        self.powered = true;
                        return callback(null, true);
                    }
                });

            } else {
                dev.exit();
                //self.log("exited device type:" + dev.type + " @ " + dev.host.address);
            }
        });
        var checkAgain = setInterval(function() {
            //self.log("Discovering Again for Status... " + self.sname);
            self.discover(b);
        }, 1000)


    },

    setMPstate: function(state, callback) {
        var self = this;
        var s_index = self.sname[1];
        var b = new broadlink();

        self.log("set " + self.sname + " state to " + state);
        if (state) {
            if (self.powered) {
                return callback(null, true);
            } else {
                self.discover(b);
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log(self.sname + " is ON!");
                        dev.set_power(s_index, true);
                        dev.exit();
                        clearInterval(checkAgainSet);
                        self.powered = true;
                        return callback(null, true);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSet = setInterval(function() {
                    //self.log("Discovering Again for Set Command... " + self.sname);
                    self.discover(b);
                }, 1000)
            }
        } else {
            if (self.powered) {
                self.discover(b);
                b.on("deviceReady", (dev) => {
                    if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                        self.log(self.sname + " is OFF!");
                        dev.set_power(s_index, false);
                        dev.exit();
                        clearInterval(checkAgainSet);
                        self.powered = false;
                        return callback(null, false);
                    } else {
                        dev.exit();
                    }
                });
                var checkAgainSet = setInterval(function() {
                    //self.log("Discovering Again for Set Command... " + self.sname);
                    self.discover(b);
                }, 1000)
            } else {
                return callback(null, false)
            }
        }
    }
}
