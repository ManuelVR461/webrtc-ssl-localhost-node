'use strict'

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;

var localStream;
var remoteStream;

var pc;

var turnReady;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {offerToReceiveAudio: true,offerToReceiveVideo: false};
var constraints = { audio: true, video: false };
/////////////////////////////////////////////

var salon = 'lynce';
// Could prompt for room name:
var cliente = prompt('Como te llamas:');

var socket = io.connect();

if (salon !== '') {
    socket.emit('crear o unir', salon);
    console.log('Atendiendo crear o unir sala', salon);
    socket.emit('mensaje', "Hola que tal soy "+cliente);
}

socket.on('creado', function(salon) {
    console.log(cliente + ' ha entrado al salon ' + salon);
    isInitiator = true;
});
  
socket.on('full', function(salon) {
    console.log('El Salon ' + salon + ' esta full');
});
  
socket.on('unir', function (salon){
    console.log('Esta persona esta uniendose al salon ' + salon + '!');
    isChannelReady = true;
});
  
socket.on('unido', function(room) {
    console.log('Unido: ' + salon);
    isChannelReady = true;
});

socket.on('log', function(array) {
    console.log.apply(console, array);
});

///////////////////////////////

function enviarMensaje(mensaje) {
    console.log('El Ciente esta enviando un mensaje: ', mensaje);
    socket.emit('mensaje', mensaje);
}

// Socket para Recibir los mensaje del servidor
socket.on('mensaje', function(mensaje) {
    console.log('Mensaje Proveniente del grupo:', mensaje.type);
    if (mensaje === 'got user media') {
        maybeStart();
    }else if (mensaje.type === 'offer') {
        
        
        if (!isInitiator && !isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(mensaje));
        doAnswer();
    } else if (mensaje.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(mensaje));
    } else if (mensaje.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
                sdpMLineIndex: mensaje.label,
                candidate: mensaje.candidate
            });
        
        // var candidate = new RTCIceCandidate(mensaje.candidate);

        pc.addIceCandidate(candidate);
    } else if (mensaje === 'bye' && isStarted) {
        handleRemoteHangup();
    }
  });

  ////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

var promisifiedOldGUM = function(constraints, successCallback, errorCallback) {
    var getUserMedia = (navigator.getUserMedia ||
                        navigator.webkitGetUserMedia ||
                        navigator.mozGetUserMedia);

    if(!getUserMedia) {
        return Promise.reject(new Error('getUserMedia no esta implementado en este navegador'));
    }
    return new Promise(function(successCallback, errorCallback) {
        getUserMedia.call(navigator, constraints, successCallback, errorCallback);
    });
}

if(navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
}

if(navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = promisifiedOldGUM;
}


navigator.mediaDevices.getUserMedia(constraints)
.then(gotStream).catch(function(e) {
    socket.emit('mensaje', " error:"+ e.name);
});

function gotStream(stream) {
    console.log('Agregando Stream Local.');
    localStream = stream;
    localVideo.srcObject = stream;
    enviarMensaje('got user media');
    if (isInitiator) {
        maybeStart();
    }
}


//console.log('Obteniendo medios del usuario con los parametros iniciales de video y audio', constraints);

if (location.hostname !== 'localhost') {
    requestTurn(
        'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
    );
}

function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
        console.log('>>>>>> creando conexion per to per');
        createPeerConnection();
        pc.addStream(localStream);
        isStarted = true;
        //console.log('isInitiator', isInitiator);
        if (isInitiator) {
            doCall();
        }
    }
}

window.onbeforeunload = function() {
    this.enviarMensaje('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('RTCPeerConnnection Creado');
    } catch (e) {
        console.log('Falla al crear PeerConnection, exception: ' + e.message);
        alert('No se Puede crear objeto RTCPeerConnection.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        enviarMensaje({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('Fin de Candidato.');
    }
}

function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function doCall() {
    console.log('Enviando offer a la persona');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Enviando Respuesta a la persona.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage enviando mensaje', sessionDescription);
    enviarMensaje(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    trace('Falla al crear descripcion de session: ' + error.toString());
}

function requestTurn(turnURL) {
    var turnExists = false;
    for (var i in pcConfig.iceServers) {
        if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
            turnExists = true;
            turnReady = true;
            break;
        }
    }
    if (!turnExists) {
        console.log('Obteniendo servidor TURN desde', turnURL);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status === 200) {
                var turnServer = JSON.parse(xhr.responseText);
                console.log('Tiene server TURN: ', turnServer);
                pcConfig.iceServers.push({
                    'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                    'credential': turnServer.password
                });
                turnReady = true;
            }
        };
        xhr.open('GET', turnURL, true);
        xhr.send();
    }
}

function handleRemoteStreamAdded(event) {
    console.log('Stream Remoto Agregado.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Stream Remoto Removido. Event: ', event);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    enviarMensaje('bye');
}

function handleRemoteHangup() {
    console.log('Sesion Terminada.');
    stop();
    isInitiator = false;
}

function stop() {
    isStarted = false;
    pc.close();
    pc = null;
}
////////////////////////////7

(function(window, document) {

    // Create the DOM structure to hold the console messages
  
    var div = document.createElement("div");
    div.style.cssText = "position: absolute; " +
      "top: 5px; left: 5px; right: 5px; bottom: 5px; " +
      "padding: 10px; " +
      "overflow-y: auto; " + 
      "display: none; " + 
      "background: rgba(0, 32, 0, 0.9); " +
      "border: 3px solid #888; " + 
      "font: 14px Consolas,Monaco,Monospace; " +
      "color: #ddd; " + 
      "z-indez: 500";
  
    var ul = document.createElement("ul");
    ul.style.cssText = "padding: 0; list-style-type: none; margin: 0";
    div.appendChild(ul)
  
    document.body.appendChild(div);
  
    var toggleButton = document.createElement("button");
    toggleButton.innerText = "Console";
    toggleButton.style.cssText = "position: absolute; right: 10px; top: 10px; z-index: 501";
  
    toggleButton.addEventListener("click", function () {
      div.style.display = div.style.display === "none" ? "block" : "none";
    });
  
    document.body.appendChild(toggleButton);
    
    var clearButton = document.createElement("button");
    clearButton.innerText = "Clear";
    clearButton.style.cssText = "position: absolute; right: 10px; top: 30px; z-index: 501";
      
    clearButton.addEventListener("click", function() {
      ul.innerHTML = "";
    });
      
    div.appendChild(clearButton);
    
    function addMsg(msg) {
      var li = document.createElement("li");
      li.innerText = msg;
      ul.appendChild(li);
    }
  
    // Monkey-patch console object
  
    var methods = ["log", "debug", "error", "info", "warn"];
  
    for (var i = 0; i < methods.length; i++) {
      var method = methods[i];
      var original = window.console[method];
      window.console[method] = function(msg) {
        addMsg(msg);
        original.apply(window.console, arguments);
      };
    }
  
  })(window, document);