// Add import statements at the top
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Add these variables at the top of your file
let classifier;
let images = [];
let imageFiles = [];
let imagesLoaded = 0;
let uniqueCategories = new Map(); // To store unique categories and their counts

function preload() {
  classifier = ml5.imageClassifier("MobileNet");
  // Load the list of files first
  loadStrings('all/list.txt', (files) => {
    imageFiles = files.filter(file => file.endsWith('.jpg'));
    loadImagesFromFolder();
  });
}

function loadImagesFromFolder() {
  // Load each image file that ends with .jpg
  imageFiles.forEach(file => {
    loadImage('all/' + file, img => {
      images.push(img);
      imagesLoaded++;
      if (imagesLoaded === imageFiles.length) {
        processImages();
      }
    });
  });
}

function processImages() {
  // Classify each image after they're all loaded
  images.forEach((img, index) => {
    classifier.classify(img, (results) => {
      // Get the top prediction for each image
      const topPrediction = results[0];
      
      // Update unique categories map
      if (uniqueCategories.has(topPrediction.label)) {
        uniqueCategories.set(
          topPrediction.label, 
          {
            count: uniqueCategories.get(topPrediction.label).count + 1,
            confidence: uniqueCategories.get(topPrediction.label).confidence + topPrediction.confidence,
            images: [...uniqueCategories.get(topPrediction.label).images, imageFiles[index]]
          }
        );
      } else {
        uniqueCategories.set(
          topPrediction.label, 
          {
            count: 1,
            confidence: topPrediction.confidence,
            images: [imageFiles[index]]
          }
        );
      }

      // If this is the last image, display the summary
      if (index === images.length - 1) {
        console.log('\nCategories Summary:');
        console.log('==================');
        uniqueCategories.forEach((data, category) => {
          const avgConfidence = (data.confidence / data.count * 100).toFixed(2);
          console.log(`\n${category}:`);
          console.log(`Count: ${data.count} images`);
          console.log(`Average confidence: ${avgConfidence}%`);
          console.log('Images:', data.images.join(', '));
          console.log('------------------');
        });
      }
    });
  });
}

function setup() {
  createCanvas(400, 400);
}
