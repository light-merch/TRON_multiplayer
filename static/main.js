import * as THREE from "./three.module.js";

import { OrbitControls } from "./OrbitControls.js";
import { OBJLoader } from './OBJLoader.js';
import { MTLLoader } from './MTLLoader.js';
import { DDSLoader } from './DDSLoader.js';


function httpGet(Url) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", Url, false); // false for synchronous request
    xmlHttp.send(null);
    return JSON.parse(xmlHttp.responseText);
}


function fileGet(file_name) {
    var rawFile = new XMLHttpRequest();
    var allText = "";
    rawFile.open("GET", file_name, false);
    rawFile.onreadystatechange = function () {
        if(rawFile.readyState === 4) {
            if(rawFile.status === 200 || rawFile.status === 0) {
                allText = rawFile.responseText;
            }
        }
    };
    rawFile.send(null);
    return JSON.parse(allText);
}


function initStats(Stats) {
    var stats = new Stats();
    stats.setMode(0); // 0: fps, 1: ms

    // Align top-left
    stats.domElement.style.position = "absolute";
    stats.domElement.style.left = "0px";
    stats.domElement.style.top = "0px";
    document.body.appendChild( stats.dom );
    return stats;
}

function touchStarted() {
    getAudioContext().resume();
}


function init() {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    var renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);

    const listener = new THREE.AudioListener();
    camera.add( listener );
    // create a global audio source
    const sound = new THREE.Audio( listener );

    // load a sound and set it as the Audio object's buffer
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load( 'sounds/engine_sound.wav', function( buffer ) {
        sound.setBuffer( buffer );
        sound.setLoop( true );
        sound.setVolume( 0.5 );
        sound.play();
    });

    document.body.appendChild(renderer.domElement);
    var controls = new OrbitControls(camera, renderer.domElement);
    controls.enableKeys = false;
    // controls.autoRotate = true;
    // controls.autoRotateSpeed = 3;

    window.addEventListener("resize", function () {
        var width = window.innerWidth;
        var height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });

    const onProgress = function ( xhr ) {

        if ( xhr.lengthComputable ) {

            const percentComplete = xhr.loaded / xhr.total * 100;
            console.log( Math.round( percentComplete, 2 ) + '% downloaded' );

        }

    };
    const onError = function () { };

    const manager = new THREE.LoadingManager();
    manager.addHandler( /\.dds$/i, new DDSLoader() );

    new MTLLoader( manager )
        .setPath( 'models/' )
        .load( 'bike.mtl', function ( materials ) {

            materials.preload();

            new OBJLoader( manager )
                .setMaterials( materials )
                .setPath( 'models/' )
                .load( 'bike.obj', function ( object ) {
                    window.template = object;

                    window.bike = window.template.clone();
                    scene.add( window.bike );

                }, onProgress, onError );

        } );

    // light
    var directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    directionalLight.position.set(6, 8, 8);
    scene.add(directionalLight);

    directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    directionalLight.position.set(-6, -8, -8);
    scene.add(directionalLight);

    var ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.7);
    scene.add(ambientLight);

    camera.position.set(0, 4, -6);

    camera.rotation.y = 3.14;
    camera.rotation.x = 0.6;

    return [scene, renderer, camera, controls]
}

function generateUsername(length) {
    for (const name of ['flynn', 'tron', 'clu', 'sam', 'quorra', 'rinzler']) {
        if (httpGet('/check/' + name)['status'] === 'false') {
            return name;
        }
    }

    var result = '';
    while (true) {
        var characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (var i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        if (httpGet('/check/' + result)['status'] === 'false') {
            return result;
        }
    }
}


window.onload = function() {
    const FizzyText = function () {
        this.username = generateUsername(6);
        this.error = "";

        this.submit_name = function () {
            this.username = this.username.toLowerCase();
            if (httpGet('/check/' + this.username)['status'] === 'true') {
                if (this.error === "") {
                    this.error = "This username is already taken"
                    var e = gui.add(fizzyText, "error").name("Error");
                    e.domElement.style.pointerEvents = "none";
                }
            } else {
                window.gameBegin = true;
                GameLoop();
                gui.destroy();
            }
        };
    };


    var stats = initStats(Stats);

    // Dat Gui controls setup
    var fizzyText = new FizzyText();
    var gui = new dat.GUI({
        load: JSON,
        preset: "Flow",
        width: 400
    });

    gui.add(fizzyText, "username").name("Enter username");
    gui.add(fizzyText, "submit_name").name("Enter game");


    document.addEventListener("keydown", onDocumentKeyDown, false);
    function onDocumentKeyDown(event) {
        if (window.gameBegin) {
            httpGet('/send_data/' + fizzyText.username + '/' + event.which);
        }
    }




    var tmp = init();
    var scene = tmp[0];
    var renderer = tmp[1];
    var camera = tmp[2];
    var controls = tmp[3];
    var allPlayers, currentPlayer, vehicles = {}, lastX = 0, lastY = 0, lastZ = 0;
    window.gameBegin = false;

    const floor_geometry = new THREE.BoxGeometry( 1000, 1, 1000 );
    const floor_material = new THREE.MeshBasicMaterial( {color: 0x4784e6} );
    var floor = new THREE.Mesh(floor_geometry, floor_material);
    scene.add(floor);


    const trail_geometry = new THREE.BoxGeometry( 0.05, 1, 1 );
    const trail_material = new THREE.MeshBasicMaterial( {color: 0x0fbef2} );


    var GameLoop = function() {
        requestAnimationFrame(GameLoop);
        stats.begin();
        controls.update();

        if (window.bike !== undefined) {
            // camera.position.z += 0.1 * Math.cos(window.bike.rotation.y);
            // camera.position.x -= 0.1 * Math.sin(window.bike.rotation.y);
            // camera.rotation.z = Math.PI + window.bike.rotation.y;

            allPlayers = httpGet('/get_data/' + fizzyText.username);

            currentPlayer = allPlayers[fizzyText.username]
            window.bike.position.set(currentPlayer["x"], currentPlayer["y"], currentPlayer["z"]);
            window.bike.rotation.y = currentPlayer["heading"];

            camera.position.x += currentPlayer["x"] - lastX;
            camera.position.y += currentPlayer["y"] - lastY;
            camera.position.z += currentPlayer["z"] - lastZ;

            for (var key in allPlayers) {
                if (key !== fizzyText.username) {
                    if (vehicles[key] === undefined) {
                        var copy = window.template.clone();
                        scene.add(copy);
                        vehicles[key] = copy;
                    } else {
                        vehicles[key].position.set(allPlayers[key].x, allPlayers[key].y, allPlayers[key].z);
                    }
                }
            }

            controls.target.set(window.bike.position.x, window.bike.position.y, window.bike.position.z);
            lastX = currentPlayer["x"];
            lastY = currentPlayer["y"];
            lastZ = currentPlayer["z"];

            // var trail = new THREE.Mesh(trail_geometry, trail_material);
            // trail.position.set(player.last_trail_x, player.last_trail_y, player.last_trail_z);
            // scene.add(trail);
        }

        renderer.render(scene, camera); 
        stats.end();
    };
};
