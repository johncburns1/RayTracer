"use strict";

//CORE VARIABLES
var canvas, context, imageBuffer;

var DEBUG = false; //whether to show debug messages
var EPSILON = 0.00001; //error margins

//scene to render
var scene, camera, surfaces, color, lights; //etc...
var inTriangle;

//a constructor for the camera to be used in the raytracing
var Camera = function(eye, at, up, fovy, aspect){
  this.eye      = new THREE.Vector3(eye[0], eye[1], eye[2]);
  this.at       = new THREE.Vector3(at[0], at[1], at[2]);
  this.up       = new THREE.Vector3(up[0], up[1], up[2]);

  //wVec points backwards from the camera
  this.wVec     = new THREE.Vector3().subVectors(this.eye, this.at).normalize();
  //uVec points to the side of the camera
  this.uVec     = new THREE.Vector3().crossVectors(this.up, this.wVec).normalize();
  //vVec points upwards local to the camera
  this.vVec     = new THREE.Vector3().crossVectors(this.wVec, this.uVec).normalize();

  this.fovy     = fovy;
  this.aspect   = aspect;

  this.halfCameraHeight  = Math.tan(rad(this.fovy/2.0));
  this.halfCameraWidth   = this.halfCameraHeight * this.aspect;

  this.cameraWidth =  2 * this.halfCameraWidth;
  this.cameraHeight = 2 * this.halfCameraHeight;

  //the size of individual pixels in 3d space, to position the points for
  //the rays to pass through
  this.pixelHeight  = this.cameraHeight / (canvas.height - 1);
  this.pixelWidth   = this.cameraWidth / (canvas.width - 1);
};

//a function to cast the given array
Camera.prototype.castRay  = function(x, y){
  var u = (x * this.pixelWidth) - this.halfCameraWidth;
  var v = this.halfCameraHeight - (y * this.pixelHeight);

  //the u (side) component to the pixel
  var uComp = this.uVec.clone().multiplyScalar(u);
  //the v (up) component to the pixel
  var vComp = this.vVec.clone().multiplyScalar(v);
  var vSum1 = new THREE.Vector3().addVectors(uComp, vComp);

  //ray.direction
  var ray = {
    "origin"    : this.eye,
    "direction" : new THREE.Vector3().addVectors(vSum1,
                  this.wVec.clone().multiplyScalar(-1))
  };

  color = trace(ray);

  setPixel(x, y, color);
};

//a constructor for a Sphere
var Sphere = function(mat, center, radius, objname, transforms) {
  this.center = new THREE.Vector3();
  this.center.fromArray(center);
  this.radius = radius;
  this.mat = mat;
};

//constructor for a triangle
var Triangle = function(mat, p1, p2, p3, objname, transforms) {
  this.p1 = new THREE.Vector3();
  this.p1.fromArray(p1);
  this.p2 = new THREE.Vector3();
  this.p2.fromArray(p2);
  this.p3 = new THREE.Vector3();
  this.p3.fromArray(p3);
  this.mat = mat;
};

//a function for the intersection of a ray and a triangle from Shirley
Triangle.prototype.intersects = function(ray) {

  //set the vertices equal to the vertices of the current triangle
  var vert1 = this.p1;
  var vert2 = this.p2;
  var vert3 = this.p3;

  //edges using vector3 objects
  var edge1 = new THREE.Vector3().subVectors(vert3, vert2);
	var edge2 = new THREE.Vector3().subVectors(vert1, vert3);
	var edge3 = new THREE.Vector3().subVectors(vert2, vert1);


  //compute the surface normal and normalize it
	var normal_num = new THREE.Vector3().crossVectors(edge1, vert1.clone().sub(vert2));
	var normal = normal_num.clone().normalize();

  //intersection array that will house our point and our normal
  var intersection = [];
  intersection[1] = this;
  intersection[2] = normal;

  //test to see if this if greater than 0 (if there is intersection)
  var test = ray.direction.clone().dot(normal);

  //calculate the point where the ray will hit
  var d = vert3.clone().sub(ray.origin).dot(normal);

  //find the ratio (t) that will yield our point
  var t = d / test;

  //calculate that point of intersection
  var point = new THREE.Vector3().addVectors(ray.origin,ray.direction.clone().multiplyScalar(t));

  //distances
	var d1 = new THREE.Vector3().subVectors(point.clone(), vert1.clone());
	var d2 = new THREE.Vector3().subVectors(point.clone(), vert2.clone());
	var d3 = new THREE.Vector3().subVectors(point.clone(), vert3.clone());

  //area of the triangle
	var aT = (edge1.clone().cross(edge2)).dot(normal);

	 //area of the three smaller triangles
	var aT1 = (((edge1.clone().cross(d3.clone())).dot(normal.clone())));
	var aT2 = (((edge2.clone().cross(d1.clone())).dot(normal.clone())));
	var aT3 = (((edge3.clone().cross(d2.clone())).dot(normal.clone())));

	//find the barycentric coordinates
	var b1 = aT1 / aT;
	var b2 = aT2 / aT;
	var b3 = aT3 / aT;

  if(b1 >= -1*EPSILON && b2 >= -1*EPSILON && b3 >= -1*EPSILON) intersection[0] = point;

  return intersection;
};


Sphere.prototype.intersects = function(ray){

  var intersection = [];
  var normal = new THREE.Vector3();
  var root;
  var pt;

  //The array to the center
  var eaug = this.center.clone().sub(ray.origin);
  var b = eaug.clone().dot(ray.direction.clone().normalize());
  var disc = (b * b) - (eaug.clone().dot(eaug.clone())) + (this.radius * this.radius);
  root = b - Math.sqrt(disc);

  if(disc < 0) {
    intersection[0] = null;
    intersection[1] = this;
    intersection[2] = null;
  }

  else {
    intersection[0] = new THREE.Vector3().addVectors(ray.origin, ray.direction.clone().normalize().multiplyScalar(root));
    intersection[1] = this;
    intersection[2] = this.center.clone().sub(intersection[0]).normalize();
  }

  return intersection;
};

function getMat(surface) {
  return scene.materials[surface.mat]
}

function calculateShading(intersectionPoint, intersectionSurface, intersectionNormal, intersectionRay, intersectionArray) {

    //get the material from the surface that we are going to be working with
    var mat = getMat(intersectionSurface);

    //a new vector that is going to hold the position of the light
    var position = new THREE.Vector3();

    //a vector that is going to hold direction for the ray
    var dir;

    //grabs the values of the given materials diffuse, ambient, and specular
    var kd = [];
    var ka = [];
    var ks = [];
    var shine = mat.shininess;
    for(var i = 0; i < mat.kd.length; i++) kd[i] = mat.kd[i];
    for(var i = 0; i < mat.ka.length; i++) ka[i] = mat.ka[i];
    for(var i = 0; i < mat.ks.length; i++) ks[i] = mat.ks[i];

    //for each light in the scene, we are going to send a ray and see if it intersects with any objects in the scene to calculate light
    for(var i = 0; i < lights.length; i++) {

      //ambient lighting
      if(lights[i].source == "Ambient") {
        for(var j = 0; j < ka.length; j++) {
          ka[j] *= lights[i].color[j];
        }
        continue;
      }

      //point lighting
      else if(lights[i].source == "Point") {
        position.set(lights[i].position[0], lights[i].position[1], lights[i].position[2]);
        dir = intersectionPoint.clone().sub(position.clone()).normalize();
      }

      //directional light
      else if(lights[i].source == "Directional") {
        dir = new THREE.Vector3(lights[i].direction[0],lights[i].direction[1],lights[i].direction[2]);
        position = intersectionPoint.clone().add(dir.normalize());
      }

      //load the values of the diffuse and the specular into a 2D array
      var kArray = calcColor(intersectionPoint, intersectionNormal, position, dir, ka, kd, ks, i, shine);
    }


    //make the color as an array
    var s1 = kArray[0][0] + kArray[1][0] + kArray[2][0];
    var s2 = kArray[0][1] + kArray[1][1] + kArray[2][1];
    var s3 = kArray[0][2] + kArray[1][2] + kArray[2][2];

    //return that color
    return [s1,s2,s3];
}

function calcColor(intersectionPoint, intersectionNormal, position, dir, ka, kd, ks, i, shine) {

  //normal line from the face
  var x = intersectionNormal.clone().dot(dir);

  //coefficient for the diffuse element
  var t = 0;
  if(x > 0) var t = x;

  //calculates the diffuse elements
  for(var j = 0; j < kd.length; j++) kd[j] *= lights[i].color[j] * t;

  var view = intersectionPoint.clone().sub(camera.eye).normalize();
  var normView = intersectionNormal.clone().dot(view.clone().add(dir.normalize()));

  //coefficient for the specular element
  var l = 0;

  //make the specular element less intense
  if(normView > 0) l = normView * .6;

  //amount of specular shading
  for(var j = 0; j < ks.length; j++) ks[j] *= Math.pow(lights[i].color[j] * l, shine);

  var kArray = [ka, kd, ks];
  return kArray;
}

function trace(ray) {

  //create an array that holds all of the intersections for a ray
  var intersectionArray = [];
  var intersect;

  //populate the array with all intersections of the array and that point
  for(var i = 0; i < surfaces.length; i++) {
    intersect = surfaces[i].intersects(ray);
    if(intersect[0] == null) continue;
    else intersectionArray.push(intersect);
  }

  if(intersectionArray.length == 0) return 0;

  var minIntersection = intersectionArray[0];

  return calculateShading(minIntersection[0], minIntersection[1], minIntersection[2]);
}

//initializes the canvas and drawing buffers
function init() {
  canvas = $('#canvas')[0];
  context = canvas.getContext("2d");
  imageBuffer = context.createImageData(canvas.width, canvas.height); //buffer for pixels

  loadSceneFile("assets/TriangleShadingTest.json");
}

function loadSurfaces() {

  var surfaces = [];

  //setting up array of surfaces
  for(var i = 0; i < scene.surfaces.length; i++){

    if (scene.surfaces[i].shape === "Sphere"){
      surfaces.push(new Sphere(
        scene.surfaces[i].material,
        scene.surfaces[i].center,
        scene.surfaces[i].radius,
        scene.surfaces[i].name,
        null
      ));

    } else{
      surfaces.push(new Triangle(
        scene.surfaces[i].material,
        scene.surfaces[i].p1,
        scene.surfaces[i].p2,
        scene.surfaces[i].p3,
        scene.surfaces[i].name,
        null
      ));
    }
  }
  return surfaces;
}

//loads and "parses" the scene file at the given path
function loadSceneFile(filepath) {

  scene = Utils.loadJSON(filepath); //load the scene

  //set the camera
  camera = new Camera(scene.camera.eye, scene.camera.at, scene.camera.up, scene.camera.fovy, scene.camera.aspect);

  //set up the lights array
  lights = scene.lights;

  surfaces = loadSurfaces();

  render(); //render the scene
}




//renders the scene
function render() {
  var start = Date.now(); //for logging
  for(var z = 0; z < canvas.width; z++) {
    for(var y = 0; y < canvas.height; y++) {
      camera.castRay(z,y);
    }
  }

  //render the pixels that have been set
  context.putImageData(imageBuffer,0,0);

  var end = Date.now(); //for logging
  $('#log').html("rendered in: "+(end-start)+"ms");
  console.log("rendered in: "+(end-start)+"ms");
}

//sets the pixel at the given x,y to the given color
/**
 * Sets the pixel at the given screen coordinates to the given color
 * @param {int} x     The x-coordinate of the pixel
 * @param {int} y     The y-coordinate of the pixel
 * @param {float[3]} color A length-3 array (or a vec3) representing the color. Color values should floating point values between 0 and 1
 */
function setPixel(x, y, color){
  var i = (y*imageBuffer.width + x)*4;
  imageBuffer.data[i] = (color[0]*255) | 0;
  imageBuffer.data[i+1] = (color[1]*255) | 0;
  imageBuffer.data[i+2] = (color[2]*255) | 0;
  imageBuffer.data[i+3] = 255; //(color[3]*255) | 0; //switch to include transparency
}

//converts degrees to radians
function rad(degrees){
  return degrees*Math.PI/180;
}

//on document load, run the application
$(document).ready(function(){
  init();
  render();

  //load and render new scene
  $('#load_scene_button').click(function(){
    var filepath = 'assets/'+$('#scene_file_input').val()+'.json';
    loadSceneFile(filepath);
  });

  //debugging - cast a ray through the clicked pixel with DEBUG messaging on
  $('#canvas').click(function(e){
    var x = e.pageX - $('#canvas').offset().left;
    var y = e.pageY - $('#canvas').offset().top;
    DEBUG = true;
    camera.castRay(x,y); //cast a ray through the point
    DEBUG = false;
  });
});
