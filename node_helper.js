'use strict';

/* Magic Mirror
 * Module: MMM-SystemStats
 *
 * By Benjamin Roesner http://benjaminroesner.com
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
const async = require('async');
const exec = require('child_process').exec;
const request = require('request');

module.exports = NodeHelper.create({
  start: function() {
    //console.log('Starting node helper: ' + this.name);
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived: function(notification, payload) {
    const self = this;

    if (notification === 'CONFIG') {
      this.config = payload;
      // first call
      self.getStats();
      // interval call
      setInterval(function() {
        self.getStats();
      }, this.config.updateInterval);
    }
    else if (notification === 'ALERT') {
      this.config = payload.config;
      // notif syslog
      //console.log('url : ' + payload.config.baseURLSyslog);
      request({ url: payload.config.baseURLSyslog + '?type=' + payload.type + '&message=' + encodeURI(payload.message), method: 'GET' }, function(error, response, body) {
        console.log("notif MMM-syslog with response " + response.statusCode);
      });
    }
  },

  getStats: function() {
    const self = this;

    let temp_conv = '';
    switch (this.config.units) {
    case "imperial":
        temp_conv = 'awk \'{printf("%.1f°F\\n",(($1*1.8)/1e3)+32)}\'';
        break;
    case "metric":
        temp_conv = 'awk \'{printf("%.1f°C\\n",$1/1e3)}\'';
        break;
    case "default":
    default:
        // kelvin
        temp_conv = 'awk \'{printf("%.1f°K\\n",($1/1e3)+273.15)}\'';
        break;
    }

    async.parallel([
      // get cpu temp
      async.apply(exec, temp_conv + ' /sys/class/thermal/thermal_zone0/temp'),
      // get system load
//      async.apply(exec, 'top -bn2 | grep "CPU(s)" | tail -n1 | awk \'{printf "%.1f", (100 - $8)}\'cat /proc/loadavg'),
      async.apply(exec, 'top -bn2 | grep "Cpu(s)" | tail -n1 | sed -n \'s/.*, *\\([0-9.]*\\)%* id.*/\\1/p\' | awk \'{printf 100 - $1}\''),
      // get free ram in %
      async.apply(exec, 'free | awk \'/^' + this.config.memTrans + ':/ {printf "%.0f", ($7*100/$2)}\''),
      // get uptime
      async.apply(exec, 'cat /proc/uptime'),
      // get root free-space
      // async.apply(exec, "df -h|grep /dev/root|awk '{print $4}'"),
      async.apply(exec, "df -h | awk '$NF == \"/\" {printf $4}'")

    ],
    function (err, res) {
      let stats = {};
      stats.cpuTemp = res[0][0];
      stats.sysLoad = res[1][0];
      stats.freeMem = res[2][0];
      stats.upTime = res[3][0].split(' ');
      stats.freeSpace = res[4][0];
      // console.log(stats);
      self.sendSocketNotification('STATS', stats);
    });
  },
});
