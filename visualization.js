import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let camera, scene, renderer, controls;
let particles = {};
let imageData = new Map();
let highResTextures = new Map();
let pendingTextures = new Set();
let frameCount = 0;
let classifier;

const PARTICLE_SIZE = 5;
const SPACING = 10;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const textureLoader = new THREE.TextureLoader();
const LOD_DISTANCE = 50;

// Add these variables at the top of your file with other globals
let autoRotate = false; // Controls whether camera automatically rotates
let autoRotateSpeed = 0.03; 
let userInteracted = false; // To track if user has manually controlled the camera
let lastUserInteractionTime = 0;
const AUTO_ROTATE_RESUME_DELAY = 10000; // ms to wait after interaction before resuming animation

// Create a single placeholder texture for all sprites initially
const placeholderCanvas = document.createElement('canvas');
const ctx = placeholderCanvas.getContext('2d');
placeholderCanvas.width = 16;
placeholderCanvas.height = 16;
ctx.fillStyle = '#cccccc';
ctx.fillRect(0, 0, 16, 16);
const placeholderTexture = new THREE.CanvasTexture(placeholderCanvas);
placeholderTexture.minFilter = THREE.LinearFilter;
placeholderTexture.magFilter = THREE.LinearFilter;

init();
animate();

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Camera setup with your specified position
    camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 2.6, 3000);

    // Renderer setup
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // Controls setup
    controls = new OrbitControls(camera, renderer.domElement);
    
    // Set the target that the camera is looking at
    controls.target.set(-142.38, -175.58, 284.02);

    // Slow down the controls
    controls.rotateSpeed = 0.3;
    controls.zoomSpeed = 0.3;
    controls.panSpeed = 0.3; 
    
    controls.enableDamping = true;   
    controls.dampingFactor = 0.05;   
    
    controls.minDistance = 50;       
    controls.maxDistance = 1000;     
    controls.maxPolarAngle = Math.PI / 1.5; 

    // Update controls after setting target
    controls.update();

    // Alternative implementation with throttled logging
    let logThrottleTimeout;
    let throttleTimeout;

    controls.addEventListener('change', function() {
        // Throttled logging
        if (!logThrottleTimeout) {
            logThrottleTimeout = setTimeout(() => {
                console.log('Camera Position:', {
                    x: camera.position.x.toFixed(2),
                    y: camera.position.y.toFixed(2),
                    z: camera.position.z.toFixed(2),
                    lookingAt: controls.target
                });
                logThrottleTimeout = null;
            }, 500); // Log at most every 500ms
        }
        
        // Existing throttled LOD update
        if (!throttleTimeout) {
            throttleTimeout = setTimeout(() => {
                updateLOD();
                throttleTimeout = null;
            }, 250);
        }
    });

    // Detect user interaction to disable auto-rotation
    controls.addEventListener('start', function() {
        userInteracted = true;
        autoRotate = false;
    });

    // Add this new listener to detect when interaction ends
    controls.addEventListener('end', function() {
        lastUserInteractionTime = Date.now();
    });

    // Events
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('click', onClick);

    // Create user navigation guide
    createNavigationGuide();
    
    // Create confidence level slider
    createConfidenceSlider();
    
    // Create reset view button
    createResetViewButton();
    
    // Initialize ML classifier only once
    classifier = ml5.imageClassifier("MobileNet");
    
    // Start loading process
    loadAndProcessImages();
}

function loadAndProcessImages() {
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading';
    loadingDiv.style.position = 'fixed';
    loadingDiv.style.top = '50%';
    loadingDiv.style.left = '50%';
    loadingDiv.style.transform = 'translate(-50%, -50%)';
    loadingDiv.style.background = 'rgba(0,0,0,0.7)';
    loadingDiv.style.color = 'white';
    loadingDiv.style.padding = '20px';
    loadingDiv.style.borderRadius = '10px';
    loadingDiv.style.zIndex = '1000';
    loadingDiv.style.fontFamily = '"Poppins", sans-serif';

    loadingDiv.innerHTML = 'Loading images... <span id="progress">0%</span>';
    document.body.appendChild(loadingDiv);

    fetch('all/list.txt')
        .then(response => response.text())
        .then(text => {
            const imageFiles = text.split('\n').filter(file => file.endsWith('.jpg'));
            
            // Process images in batches to avoid browser hanging
            processImagesInBatches(imageFiles, 0, {});
        })
        .catch(error => {
            console.error("Error loading image list:", error);
            document.getElementById('loading').innerHTML = 'Error loading images: ' + error.message;
        });
}

function createNavigationGuide() {
    // Create a toggle button for the dropdown
    const toggleButton = document.createElement('div');
    toggleButton.id = 'guide-toggle';
    toggleButton.innerHTML = 'Navigation Guide';
    toggleButton.style.position = 'fixed';
    toggleButton.style.top = '20px';
    toggleButton.style.left = '20px';
    toggleButton.style.backgroundColor = 'rgba(0,0,0,0.7)';
    toggleButton.style.color = 'white';
    toggleButton.style.padding = '8px 12px';
    toggleButton.style.borderRadius = '4px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.zIndex = '1001';
    toggleButton.style.fontFamily = '"Poppins", sans-serif';
    toggleButton.style.fontSize = '12px';
    toggleButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    toggleButton.style.userSelect = 'none';
    
    // Create guide container as a dropdown
    const guideContainer = document.createElement('div');
    guideContainer.id = 'navigation-guide';
    guideContainer.style.position = 'fixed';
    guideContainer.style.top = '50px'; // Position below the toggle button
    
    guideContainer.style.backgroundColor = 'rgba(0,0,0,0.7)';
    guideContainer.style.color = 'white';
    guideContainer.style.padding = '15px';
    guideContainer.style.borderRadius = '8px';
    guideContainer.style.maxWidth = '280px';
    guideContainer.style.zIndex = '1000';
    guideContainer.style.fontFamily = '"Poppins", sans-serif';
    guideContainer.style.fontSize = '12px';
    guideContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    guideContainer.style.transition = 'opacity 0.3s, transform 0.3s';
    guideContainer.style.opacity = '0';
    guideContainer.style.transform = 'translateY(-10px)';
    guideContainer.style.display = 'none';
    
    // Add guide content with keyboard/mouse instructions
    guideContainer.innerHTML = `
        <ul style="padding-left: 20px; margin: 0;">
            <strong>Rotate:</strong> Click and drag <br>
            <strong>Pan:</strong> Hold Shift + drag <br>
            <strong>Zoom:</strong> Scroll up/down <br>
            <strong>Select image:</strong> Click on it <br>
            <strong>Reset view:</strong> Click empty space<br>
        </ul>
    `;
    
    // Add to document
    document.body.appendChild(toggleButton);
    document.body.appendChild(guideContainer);
    
    // Add toggle functionality
    let isOpen = false;
    toggleButton.addEventListener('click', function() {
        if (isOpen) {
            // Close the dropdown
            guideContainer.style.opacity = '0';
            guideContainer.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                guideContainer.style.display = 'none';
            }, 300);
            toggleButton.innerHTML = 'Navigation Guide';
        } else {
            // Open the dropdown
            guideContainer.style.display = 'block';
            setTimeout(() => {
                guideContainer.style.opacity = '1';
                guideContainer.style.transform = 'translateY(0)';
            }, 10);
            toggleButton.innerHTML = '✕ Navigation Guide';
        }
        isOpen = !isOpen;
    });
    
    // Close the dropdown when clicking outside of it
    document.addEventListener('click', function(event) {
        const isClickInsideToggle = toggleButton.contains(event.target);
        const isClickInsideGuide = guideContainer.contains(event.target);
        
        if (!isClickInsideToggle && !isClickInsideGuide && isOpen) {
            // Close the dropdown
            guideContainer.style.opacity = '0';
            guideContainer.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                guideContainer.style.display = 'none';
            }, 300);
            toggleButton.innerHTML = 'Navigation Guide';
            isOpen = false;
        }
    });
    
    // Check if we should start with the guide open or closed
    // Default to open for new users
    if (localStorage.getItem('navigationGuideState') === 'closed') {
        // Start closed
        guideContainer.style.display = 'none';
    } else {
        // Start open for first-time users
        isOpen = true;
        guideContainer.style.display = 'block';
        setTimeout(() => {
            guideContainer.style.opacity = '1';
            guideContainer.style.transform = 'translateY(0)';
        }, 10);
        toggleButton.innerHTML = '✕ Navigation Guide';
    }
    
    // Save state when changing
    toggleButton.addEventListener('click', function() {
        localStorage.setItem('navigationGuideState', isOpen ? 'open' : 'closed');
    });
}

function processImagesInBatches(imageFiles, startIndex, categoriesMap) {
    const BATCH_SIZE = 10;
    const endIndex = Math.min(startIndex + BATCH_SIZE, imageFiles.length);
    
    // Process current batch
    const promises = [];
    
    for (let i = startIndex; i < endIndex; i++) {
        const file = imageFiles[i];
        const promise = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = 'all/' + file;
            
            img.onload = () => {
                // Classify image
                classifier.classify(img).then(results => {
                    const category = results[0].label;
                    
                    if (!categoriesMap[category]) {
                        categoriesMap[category] = [];
                    }
                    
                    categoriesMap[category].push({
                        filename: file,
                        confidence: results[0].confidence
                    });
                    
                    resolve();
                });
            };
            
            img.onerror = () => {
                console.error("Error loading image:", file);
                resolve();
            };
        });
        
        promises.push(promise);
    }
    
    // Update progress indicator
    const percentComplete = Math.round((endIndex / imageFiles.length) * 100);
    document.getElementById('progress').textContent = `${percentComplete}%`;
    document.getElementById('progress').style.fontFamily = '"Poppins", sans-serif';
    
    // When all images in this batch are processed
    Promise.all(promises).then(() => {
        if (endIndex < imageFiles.length) {
            // Process next batch
            setTimeout(() => {
                processImagesInBatches(imageFiles, endIndex, categoriesMap);
            }, 10);
        } else {
            // All batches completed
            document.getElementById('loading').remove();
            
            // Convert object to Map
            const categoryMap = new Map();
            Object.entries(categoriesMap).forEach(([key, value]) => {
                categoryMap.set(key, value);
            });
            
            // Create visualization
            createParticleGroups(categoryMap);
        }
    });
}

function createParticleGroups(categoriesMap) {
    // First, sort categories by the number of images (count)
    const sortedCategories = [...categoriesMap.entries()]
        .sort((a, b) => b[1].length - a[1].length); // Sort by descending count
    
    console.log("Sorted categories by count:", sortedCategories.map(c => `${c[0]}: ${c[1].length} images`));
    
    // Create a grid layout for the categories with most populated in center
    const GRID_COLS = Math.ceil(Math.sqrt(sortedCategories.length)); // Make grid roughly square
    const CATEGORY_SPACING_X = SPACING * 25;
    const CATEGORY_SPACING_Z = SPACING * 25;
    
    let totalCategories = sortedCategories.length;
    
    // Calculate grid dimensions
    const gridWidth = GRID_COLS * CATEGORY_SPACING_X;
    const gridRows = Math.ceil(totalCategories / GRID_COLS);
    const gridHeight = gridRows * CATEGORY_SPACING_Z;
    
    // Center of the grid
    const centerX = 0;
    const centerZ = 0;
    
    // Function to position categories in spiral pattern from center
    function getSpiralCoordinates(index, totalCategories) {
        // Place the largest group at center (index 0)
        if (index === 0) {
            return { x: centerX, z: centerZ };
        }
        
        // For others, create a spiral pattern
        const angle = index * 0.5; // Angle increases with each category
        const radius = Math.sqrt(index) * CATEGORY_SPACING_X * 2; // Radius increases as sqrt
        
        return {
            x: centerX + radius * Math.cos(angle),
            z: centerZ + radius * Math.sin(angle)
        };
    }
    
    // Process each category in order of size (largest to smallest)
    sortedCategories.forEach(([category, images], categoryIndex) => {
        const group = new THREE.Group();
        
        // Get spiral coordinates for this category
        const { x: categoryX, z: categoryZ } = getSpiralCoordinates(categoryIndex, totalCategories);
        const categoryY = 0; // Base height for this category
        
        // Determine grid size for images within this category
        const cols = Math.ceil(Math.sqrt(images.length));
        
        // Create sprites for each image in this category
        images.forEach((img, i) => {
            const x = categoryX + (i % cols) * SPACING - (cols * SPACING) / 2;
            const z = categoryZ + Math.floor(i / cols) * SPACING - (Math.floor(images.length / cols) * SPACING) / 2;
            
            // Calculate y position based on confidence level (slight elevation)
            // Map confidence (typically 0.0-1.0) to a small range (0-5)
            const confidenceElevation = img.confidence * 30; // Reduced from 30 to 5 for subtler effect
            const y = categoryY + confidenceElevation;
            
            // Create sprite with loading placeholder first
            const material = new THREE.SpriteMaterial({ 
                map: placeholderTexture
            });
            const sprite = new THREE.Sprite(material);
            
            sprite.scale.set(PARTICLE_SIZE, PARTICLE_SIZE, 1);
            sprite.position.set(x, y, z); // Use confidence-based y-position
            
            // Store image data for later use
            const positionKey = `${x},${y},${z}`;
            imageData.set(positionKey, {
                filename: img.filename,
                category: category,
                confidence: img.confidence,
                sprite: sprite,
                loaded: false, 
                highQualityLoaded: false 
            });
            
            group.add(sprite);
            
            if (!pendingTextures.has(img.filename)) {
                pendingTextures.add(img.filename);
                setTimeout(() => {
                    textureLoader.load('all/' + img.filename, 
                        (texture) => {
                            texture.minFilter = THREE.LinearFilter;
                            texture.magFilter = THREE.LinearFilter;
                            highResTextures.set(img.filename, texture);
                            
                            const imageDataEntry = imageData.get(positionKey);
                            if (imageDataEntry) {
                                sprite.material.map = texture;
                                sprite.material.needsUpdate = true;
                                imageDataEntry.loaded = true;
                            }
                            pendingTextures.delete(img.filename);
                        },
                        undefined,
                        () => {
                            pendingTextures.delete(img.filename);
                        }
                    );
                }, 10);
            }
        });
        
        group.userData.category = category;
        group.userData.count = images.length;
        scene.add(group);
        particles[category] = group;
    });
    
    // Adjust camera position to view the entire scene
    const viewRadius = Math.sqrt(totalCategories) * CATEGORY_SPACING_X;
    positionCameraForSpiralView(viewRadius);
    
    // Enable auto-rotation after a short delay
    setTimeout(() => {
        autoRotate = true;
    }, 8000);
}

function positionCameraForSpiralView(viewRadius) {
    // Use the specific position you want
    camera.position.set(411.84, 386.34, 898.09);
    controls.target.set(-142.38, -175.58, 284.02);
    controls.update();
}

// Add this function to handle loading higher quality textures when closer to objects
function updateLOD() {
    // Process a subset of images each frame for better performance
    imageData.forEach((data, key) => {
        const sprite = data.sprite;
        
        // Skip if sprite is not visible due to confidence filtering
        if (!sprite.visible) return;
        
        // Get position from the key (stored as "x,y,z")
        const [x, y, z] = key.split(',').map(Number);
        const position = new THREE.Vector3(x, y, z);
        const distance = camera.position.distanceTo(position);
        
        // If close enough and high quality version not loaded yet
        if (distance < LOD_DISTANCE && !data.highQualityLoaded) {
            if (!pendingTextures.has('hq_' + data.filename)) {
                pendingTextures.add('hq_' + data.filename);
                
                // Load higher resolution texture
                textureLoader.load('all/' + data.filename, 
                    (texture) => {
                        texture.minFilter = THREE.LinearMipMapLinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                        
                        highResTextures.set('hq_' + data.filename, texture);
                        pendingTextures.delete('hq_' + data.filename);
                        
                        // Update with high quality texture
                        sprite.material.map = texture;
                        sprite.material.needsUpdate = true;
                        data.highQualityLoaded = true;
                    },
                    undefined,
                    () => {
                        pendingTextures.delete('hq_' + data.filename);
                    }
                );
            }
        }
        // Switch back to standard quality if moved far away
        else if (distance >= LOD_DISTANCE && data.highQualityLoaded) {
            // If we have the standard quality texture stored
            if (highResTextures.has(data.filename)) {
                sprite.material.map = highResTextures.get(data.filename);
                sprite.material.needsUpdate = true;
                data.highQualityLoaded = false;
            }
        }
    });
}

// Window resize handler - updates camera and renderer when browser window is resized
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Mouse movement handler - updates the pointer coordinates for raycasting
function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// Modified function to implement the confidence slider with new styling
function createConfidenceSlider() {
    // Add the Poppins font to the document
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300&display=swap';
    document.head.appendChild(fontLink);
    
    // Create container for slider and labels
    const sliderContainer = document.createElement('div');
    sliderContainer.id = 'confidence-slider-container';
    sliderContainer.style.position = 'fixed';
    sliderContainer.style.bottom = '10px';
    sliderContainer.style.left = '13%';
    sliderContainer.style.transform = 'translateX(-50%)';
    sliderContainer.style.backgroundColor = 'rgba(0,0,0,0.8)';
    sliderContainer.style.padding = '20px 30px';
    sliderContainer.style.borderRadius = '15px';
    sliderContainer.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
    sliderContainer.style.zIndex = '1000';
    sliderContainer.style.width = '400px';
    sliderContainer.style.fontFamily = '"Poppins", sans-serif';
    
    // Create header container for title and value side by side
    const headerContainer = document.createElement('div');
    headerContainer.style.display = 'flex';
    headerContainer.style.justifyContent = 'space-between';
    headerContainer.style.alignItems = 'center';
    headerContainer.style.marginBottom = '10px';
    headerContainer.style.width = '100%';
    
    // Create title - change yellow to white
    const titleElement = document.createElement('div');
    titleElement.innerHTML = 'Filter by Confidence';
    titleElement.style.fontWeight = '300';
    titleElement.style.fontSize = '12px';
    titleElement.style.color = '#ffffff'; // Changed from #ffff4d to white
    
    // Create value display - change yellow to white
    const valueDisplay = document.createElement('div');
    valueDisplay.id = 'rangeValue';
    valueDisplay.innerHTML = '0%';
    valueDisplay.style.fontSize = '12px';
    valueDisplay.style.color = '#ffffff'; // Changed from #ffff4d to white
    valueDisplay.style.fontWeight = '400';
    
    // Add title and value to header container
    headerContainer.appendChild(titleElement);
    headerContainer.appendChild(valueDisplay);
    
    // Create slider element with the custom styling
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '0';
    slider.id = 'confidence-slider';
    slider.className = 'range';
    slider.style.width = '100%';
    slider.style.height = '10px';
    slider.style.webkitAppearance = 'none';
    slider.style.appearance = 'none';
    slider.style.background = '#111';
    slider.style.outline = 'none';
    slider.style.borderRadius = '15px';
    slider.style.overflow = 'hidden';
    slider.style.boxShadow = 'inset 0 0 5px rgba(0, 0, 0, 1)';
    
    // Add custom CSS for the slider thumb (handle)
    const style = document.createElement('style');
    style.textContent = `
        .range::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 15px;
            height: 15px;
            border-radius: 50%;
            background: #ffffff; 
            cursor: pointer;
            border: 4px solid #333;
            box-shadow: -407px 0 0 400px #ffffff; 
        }
        .range::-moz-range-thumb {
            width: 15px;
            height: 15px;
            border-radius: 50%;
            background: #ffffff; 
            cursor: pointer;
            border: 4px solid #333;
            box-shadow: -407px 0 0 400px #ffffff; 
        }
    `;
    document.head.appendChild(style);
    
    // Assemble container - add header container first
    sliderContainer.appendChild(headerContainer);
    sliderContainer.appendChild(slider);
    document.body.appendChild(sliderContainer);
    
    
    slider.addEventListener('input', function() {
        const confidenceThreshold = parseInt(slider.value) / 100;
        valueDisplay.innerHTML = `${slider.value}%`;
        
        
        const whiteIntensity = Math.min(90, parseInt(slider.value)); 
        valueDisplay.style.color = `rgb(255, 255, 255)`; 
        
        filterImagesByConfidence(confidenceThreshold);
    });
}

// Modified reset button function - removed animation control
function createResetViewButton() {
    // Create reset button container
    const resetButton = document.createElement('div');
    resetButton.id = 'reset-view-button';
    resetButton.innerHTML = 'Reset View';
    resetButton.style.position = 'fixed';
    resetButton.style.bottom = '25px';
    resetButton.style.right = '0%';
    resetButton.style.transform = 'translateX(-50%)';
    resetButton.style.backgroundColor = 'rgb(0, 0, 0)';
    resetButton.style.color = 'white';
    resetButton.style.padding = '8px 15px';
    resetButton.style.cursor = 'pointer';
    resetButton.style.zIndex = '1000';
    resetButton.style.fontFamily = '"Poppins", sans-serif';
    resetButton.style.fontSize = '12px';
    resetButton.style.fontWeight = '300';
    resetButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    resetButton.style.textAlign = 'center';
    resetButton.style.transition = 'all 0.2s ease';
    
    // Add hover effect
    resetButton.addEventListener('mouseenter', function() {
        resetButton.style.backgroundColor = 'rgba(111, 111, 111, 0.91)';
    });
    
    resetButton.addEventListener('mouseleave', function() {
        resetButton.style.backgroundColor = 'rgb(0, 0, 0)';
    });
    
    // Add click event to reset camera - keep animation state separate
    resetButton.addEventListener('click', function() {
        // Reset camera to initial position and target
        camera.position.set(411.84, 386.34, 898.09);
        controls.target.set(-142.38, -175.58, 284.02);
        controls.update();
        
        // Add a visual feedback for the click
        resetButton.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
        resetButton.style.color = 'black'; 
        setTimeout(() => {
            resetButton.style.backgroundColor = 'rgb(37, 37, 37)';
            resetButton.style.color = 'white'; 
        }, 200);
    });
    
    document.body.appendChild(resetButton);
}

// Function to filter images based on confidence threshold
function filterImagesByConfidence(threshold) {
    imageData.forEach((data, key) => {
        const sprite = data.sprite;
        
        if (data.confidence >= threshold) {
            // Show images above threshold
            sprite.visible = true;
        } else {
            // Hide images below threshold
            sprite.visible = false;
        }
    });
}

// Add this function to close the imagePreview
function closeImagePreview() {
    const container = document.getElementById('imagePreview');
    if (container) {
        container.style.display = 'none';
        
        // Reset opacity of all sprites back to normal
        Object.values(particles).forEach(p => {
            p.children.forEach(s => {
                if (s instanceof THREE.Sprite && s.visible) {
                    s.material.opacity = 1.0;
                }
            });
        });
    }
}

// Modify the onClick function to check if we clicked on a sprite
function onClick(event) {
    raycaster.setFromCamera(pointer, camera);
    
    // Flag to track if we hit any sprite
    let hitSprite = false;
    
    Object.values(particles).forEach(group => {
        const intersects = raycaster.intersectObjects(group.children.filter(sprite => sprite.visible), true);
        if (intersects.length > 0) {
            hitSprite = true;
            const sprite = intersects[0].object;
            const position = sprite.position;
            const key = `${position.x},${position.y},${position.z}`;
            const data = imageData.get(key);
            
            if (data) {
                const preview = document.getElementById('preview');
                const info = document.getElementById('imageInfo');
                const container = document.getElementById('imagePreview');
                
                // Always load original image at full quality for the preview
                preview.src = 'all/' + data.filename;
                
                const confidencePercent = (data.confidence * 100).toFixed(2);
                const totalImagesInCategory = particles[data.category].userData.count;
                
                // Enhanced information display with more prominent category information
                info.innerHTML = `
                    <h2>${data.category}</h2>
                    <p><strong>Category size:</strong> ${totalImagesInCategory} images</p>
                    <p><strong>Confidence:</strong> ${confidencePercent}%</p>
                    <div class="confidence-bar">
                        <div class="confidence-level" style="width: ${confidencePercent}%"></div>
                    </div>
                `;
                
                // Highlight selected category - only visible sprites
                Object.values(particles).forEach(p => {
                    p.children.forEach(s => {
                        if (s instanceof THREE.Sprite && s.visible) {
                            s.material.opacity = p === group ? 1.0 : 0.3;
                        }
                    });
                });
                
                container.style.display = 'block';
            }
        }
    });
    
    // If no sprite was clicked, close any open preview
    if (!hitSprite) {
        closeImagePreview();
    }
}

// Add event listener for clicks outside the canvas and outside the preview
document.addEventListener('click', function(event) {
    const container = document.getElementById('imagePreview');
    const canvas = renderer.domElement;
    
    // Skip if click was on the canvas (the onClick handler will handle it)
    if (event.target === canvas) {
        return;
    }
    
    // If the preview is open and the click is outside it
    if (container && container.style.display === 'block') {
        const isClickInsidePreview = container.contains(event.target);
        if (!isClickInsidePreview) {
            closeImagePreview();
        }
    }
});

// Add this function after your existing code - it runs the animation loop
function animate() {
    requestAnimationFrame(animate);
    frameCount++;
    
    // Check if we should resume auto-rotation after user interaction has stopped
    if (userInteracted && !autoRotate && Date.now() - lastUserInteractionTime > AUTO_ROTATE_RESUME_DELAY) {
        autoRotate = true;
        userInteracted = false;
    }
    
    // Apply auto-rotation if enabled
    if (autoRotate) {
        // Rotate camera position clockwise around the target point
        const currentPosition = new THREE.Vector3().copy(camera.position);
        const targetPosition = new THREE.Vector3().copy(controls.target);
        
        // Calculate vector from target to camera in the XZ plane only
        const xzDistance = Math.sqrt(
            Math.pow(currentPosition.x - targetPosition.x, 2) + 
            Math.pow(currentPosition.z - targetPosition.z, 2)
        );
        
        // Preserve the y-offset from target
        const yOffset = currentPosition.y - targetPosition.y;
        
        // Get the current angle in the XZ plane
        let angle = Math.atan2(
            currentPosition.z - targetPosition.z,
            currentPosition.x - targetPosition.x
        );
        
        // Increment angle for rotation (negative for clockwise in this coordinate system)
        angle -= autoRotateSpeed * 0.02; // Reduced for subtler rotation
        
        // Calculate new position while preserving y-elevation
        const newX = targetPosition.x + xzDistance * Math.cos(angle);
        const newZ = targetPosition.z + xzDistance * Math.sin(angle);
        
        // Update camera position, maintaining the y-position
        camera.position.x = newX;
        camera.position.z = newZ;
        camera.position.y = targetPosition.y + yOffset; // Keep the same y-offset from target
        
        // Look at the current target
        camera.lookAt(targetPosition);
    }
    
    controls.update(); // Required for damping to work correctly
    renderer.render(scene, camera);
}