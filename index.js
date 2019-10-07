'use strict'
const fs = require('fs');
const https = require('https');
const express = require('express');
const morgan = require('morgan');
const socketIO = require('socket.io');
const app = express();
const privateKey = fs.readFileSync('./sslcert/key.pem').toString();
const certificate = fs.readFileSync('./sslcert/csr.pem').toString();
const ssl = {key:privateKey,cert:certificate};

app.set('PORT',process.env.PORT || 3000);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(__dirname + '/public/'));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.json({data:[1,2,3]});
});

const server = https.createServer(ssl,app).listen(app.get('PORT'),()=>{
    console.log(`server iniciado desde el puerto ${app.get('PORT')}`); 
});

var io = socketIO.listen(server);

io.sockets.on('connection', function (socket) {

    function log() {
        var array = ['Mensaje desde el Servidor:'];
        array.push.apply(array, arguments);
        console.log(array);
        socket.emit('log', array);
    }

    socket.on('mensaje', function(mensaje) {
        log('Mensaje en index.js para retransmitir a todos: ', mensaje);
        socket.broadcast.emit('mensaje', mensaje);
    });
    
    socket.on('crear o unir', function(salon) {
        var clientsInRoom = io.sockets.adapter.rooms[salon];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        log('Salon ' + salon + ' ahora tiene ' + numClients + ' cliente(s)');

        if (numClients === 0) {
            socket.join(salon);
            log('Cliente ID ' + socket.id + ' entra salon creado ' + salon);
            socket.emit('creado', salon, socket.id);
            
        }else if (numClients === 1) {
            log('Cliente ID ' + socket.id + ' entrado salon ' + salon);
            io.sockets.in(salon).emit('unir', salon);
            socket.join(salon);
            socket.emit('unido', salon, socket.id);
            io.sockets.in(salon).emit('ready');

        } else { // max dos clientes
            socket.emit('full', salon);
        }

    });

    socket.on('remoteonoff',function(){
        socket.emit('onoff',{isMediaStreamTrackDisabled: true,mediaStreamLabel: salon.label});
    });

    socket.on('ipaddr', function() {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function(details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });

});

