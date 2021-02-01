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



function init() {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    var renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);

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
            console.log( Math.round(percentComplete, 2) + '% downloaded' );

        }

    };
    const onError = function () { };

    const manager = new THREE.LoadingManager();
    manager.addHandler(/\.dds$/i, new DDSLoader());

    new MTLLoader(manager)
        .setPath('models/')
        .load( 'bike.mtl', function (materials) {

            materials.preload();

            new OBJLoader(manager)
                .setMaterials( materials )
                .setPath('models/')
                .load( 'bike.obj', function (object) {
                    var pivotPoint = new THREE.Object3D();
                    pivotPoint.add(object);
                    object.position.set(0, -0.3, 2);
                    window.template = pivotPoint;
                    window.bike = window.template.clone();
                    scene.add(window.bike);

                }, onProgress, onError );

        });

    new MTLLoader(manager)
        .setPath('models/')
        .load( 'arena.mtl', function (materials) {

            materials.preload();

            new OBJLoader(manager)
                .setMaterials( materials )
                .setPath('models/')
                .load( 'arena.obj', function (object) {
                    window.arena = object;
                    scene.add(window.arena);
                    window.arena.scale.set(40, 1, 40);
                    window.arena.rotation.y = 180;

                }, onProgress, onError );

        } );

    // light
    var ambientLight = new THREE.AmbientLight(0xFFFFFF, 8);
    scene.add(ambientLight);

    camera.position.set(0, 8, -15);

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
            const listener = new THREE.AudioListener();
            camera.add( listener );
            // create a global audio source
            const sound = new THREE.Audio( listener );

            // load a sound and set it as the Audio object's buffer
            const audioLoader = new THREE.AudioLoader();
            audioLoader.load( 'sounds/tron_legacy.mp3', function(buffer) {
                sound.setBuffer( buffer );
                sound.setLoop(true);
                sound.setVolume(0.5);
            });
            sound.play();

            this.username = this.username.toLowerCase();
            if (httpGet('/check/' + this.username)['status'] === 'true' || this.username.length >= 30) {
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

    var allPlayers, currentPlayer, vehicles = {}, lastX = 0, lastY = 0, lastZ = 0, lastHeading = 0, lastTrail = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0)];
    window.gameBegin = false;
    window.names = {};
    const MAX_POINTS = 100000;
    var lastBufferIndex = 0;

    const loader = new THREE.FontLoader();
    loader.load( 'models/font.json', function (font) {
        window.font = font;
    });

    var trail_geometry = new THREE.BufferGeometry();
    var trail_vertices = new Float32Array(MAX_POINTS * 3);


    function appendPoint(trail_vertices, vector) {
        trail_vertices[lastBufferIndex ++] = vector.x;
        trail_vertices[lastBufferIndex ++] = vector.y;
        trail_vertices[lastBufferIndex ++] = vector.z;

        return trail_vertices
    }

    // Trail init
    trail_geometry.setAttribute( 'position', new THREE.BufferAttribute( trail_vertices, 3 ) );
    var trail_material = new THREE.MeshBasicMaterial( { color: 0x0fbef2 } );
    var mesh = new THREE.Mesh( trail_geometry, trail_material );
    scene.add(mesh);
    mesh.traverse( function( node ) {
        if( node.material ) {
            node.material.side = THREE.DoubleSide;
        }
    });
    mesh.frustumCulled = false;



    // Main loop
    var GameLoop = function() {
        requestAnimationFrame(GameLoop);
        stats.begin();
        controls.update();

        // Check if bike isn't created yet
        if (window.bike !== undefined) {
            // Get data about all players
            allPlayers = httpGet('/get_data/' + fizzyText.username);

            // Update camera
            currentPlayer = allPlayers[fizzyText.username];
            camera.position.x += currentPlayer["x"] - lastX;
            camera.position.y += currentPlayer["y"] - lastY;
            camera.position.z += currentPlayer["z"] - lastZ;

            var angle = lastHeading - currentPlayer["heading"];
            console.log(angle);

            if (Math.abs(angle) >= 0.0001) {
                var x = [camera.position.x, window.bike.position.x];
                var y = [camera.position.z, window.bike.position.z];
                camera.position.x = window.bike.position.x + (x[0] - x[1]) * Math.cos(angle) + (y[0] - y[1]) * (-Math.sin(angle));
                camera.position.z = window.bike.position.z + (x[0] - x[1]) * Math.sin(angle) + (y[0] - y[1]) * Math.cos(angle);

                lastHeading = currentPlayer["heading"];
            }

            // Update user's bike
            window.bike.position.set(currentPlayer["x"], currentPlayer["y"], currentPlayer["z"]);
            window.bike.rotation.y = currentPlayer["heading"];
            controls.target.set(window.bike.position.x, window.bike.position.y, window.bike.position.z);


            // Update trail
            trail_vertices = appendPoint(trail_vertices, lastTrail[0]);
            trail_vertices = appendPoint(trail_vertices, lastTrail[1]);
            trail_vertices = appendPoint(trail_vertices, window.bike.position);

            var top_bike = new THREE.Vector3(window.bike.position.x, window.bike.position.y + 1, window.bike.position.z)
            trail_vertices = appendPoint(trail_vertices, top_bike);
            trail_vertices = appendPoint(trail_vertices, window.bike.position);
            trail_vertices = appendPoint(trail_vertices, lastTrail[1]);

            lastTrail[1] = top_bike;
            lastTrail[0] = new THREE.Vector3(window.bike.position.x, window.bike.position.y, window.bike.position.z);

            trail_geometry.setAttribute( 'position', new THREE.BufferAttribute( trail_vertices, 3 ) );



            // Display all players
            for (var key in allPlayers) {
                if (key !== fizzyText.username) {
                    if (vehicles[key] === undefined) {
                        var copy = window.template.clone();
                        scene.add(copy);
                        vehicles[key] = copy;
                        window.key = key;

                        // Display usernames
                        const geometry = new THREE.TextGeometry(window.key, {
                            font: window.font,
                            size: 80,
                            height: 3,
                            curveSegments: 12,
                            bevelEnabled: true,
                            bevelThickness: 1,
                            bevelSize: 1,
                            bevelOffset: 0,
                            bevelSegments: 5
                        });

                        geometry.computeBoundingBox();
                        geometry.center();
                        const material = new THREE.MeshPhongMaterial( {color: 0x444444} );
                        var text = new THREE.Mesh(geometry, material);

                        text.scale.set(0.015, 0.015, 0.015);
                        window.names[window.key] = text;
                        scene.add(text);
                    } else {
                        // Update players cars
                        vehicles[key].position.set(allPlayers[key].x, allPlayers[key].y, allPlayers[key].z);
                        vehicles[key].rotation.y = allPlayers[key].heading;
                        window.names[key].position.set(allPlayers[key].x, allPlayers[key].y + 3, allPlayers[key].z);
                        // Rotate username to face user
                        window.names[key].lookAt(window.bike.position.x, window.bike.position.y + 3, window.bike.position.z);
                    }
                }
            }

            lastX = currentPlayer["x"];
            lastY = currentPlayer["y"];
            lastZ = currentPlayer["z"];
        }

        renderer.render(scene, camera); 
        stats.end();
    };
};
