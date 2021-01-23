import * as THREE from "./three.module.js";

import { OrbitControls } from "./OrbitControls.js";
import { OBJLoader } from './OBJLoader.js';
import { MTLLoader } from './jsm/loaders/MTLLoader.js';


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


    const loader = new OBJLoader();
    loader.load(
        // resource URL
        'models/lightcycle.obj',
        // called when resource is loaded
        function ( object ) {
            window.bike = object;
            scene.add( object );
        },
        // called when loading is in progresses
        function ( xhr ) {
            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
        },
        // called when loading has errors
        function ( error ) {
            console.log( 'An error happened' );
        }
    );

    // light
    var directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    directionalLight.position.set(6, 8, 8);
    scene.add(directionalLight);

    directionalLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    directionalLight.position.set(-6, -8, -8);
    scene.add(directionalLight);

    var ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.7);
    scene.add(ambientLight);

    camera.position.set(-1.83222123889, 1.83199683912, -2.66435763809);

    camera.rotation.y = 3.14;
    camera.rotation.x = 0.6;

    return [scene, renderer, camera, controls]
}




window.onload = function() {
    const FizzyText = function () {
        this.num_particles = 0;
        this.color = [255, 255, 0]; // RGB array
        this.pointWidth = 1;

        this.time = 0.0;
        this.mode = "offline";
        this.speedMode = "1.00";
        this.name = "Pavel Artushkov";

        this.drawCube = true;
        this.play = true;
        this.turnOn = false;

        this.reset_defaults = function () {
            for (var i = 0; i < gui.__controllers.length; i++) {
                gui.__controllers[i].setValue(gui.__controllers[i].initialValue);
            }
        };
    };

    var FrameId = 1, direction = 1, arrayOfPoints = [], data;
    window.default_size = 0.007;

    var stats = initStats(Stats);

    // Dat Gui controls setup
    var fizzyText = new FizzyText();
    var gui = new dat.GUI({
        load: JSON,
        preset: "Flow",
        width: 300
    });


    // class Player {
    //     constructor(x, y, z, rotation) {
    //         this.x;
    //         this.y;
    //         this.z;
    //         this.rotation = 0
    //     }
    // }
    // var player = new Player(0, 0, 0, 0);


    document.addEventListener("keydown", onDocumentKeyDown, false);
    function onDocumentKeyDown(event) {
        var keyCode = event.which;
        console.log(keyCode);
        if (keyCode == 32) { // Space
            fizzyText.play = !fizzyText.play;
        } else if (keyCode == 65) { // A
            window.bike.rotation.z -= 0.1;
        } else if (keyCode == 68) { // D
            window.bike.rotation.z += 0.1;
        }
    };


    var tmp = init();
    var scene = tmp[0];
    var renderer = tmp[1];
    var camera = tmp[2];
    var controls = tmp[3];

    // run game loop (update, render, repeat)
    var GameLoop = function() {
        requestAnimationFrame(GameLoop);
        stats.begin();
        controls.update();

        // window.bike.position.z += 0.1;
        // camera.position.z += 0.1;

        renderer.render(scene, camera); 
        stats.end();
    };
    GameLoop(scene);
};
