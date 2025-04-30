// main.js
// Three.js sahne ve split-screen render döngüsü

// Sahneyi oluştur
const scene = new THREE.Scene();

// Takip için bir saat nesnesi oluşturuyorum
const clock = new THREE.Clock();

// Aydınlatma ekliyorum
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100, 100, 50);
scene.add(dirLight);

// Zemin ve pist ekliyorum
const groundGeo = new THREE.PlaneGeometry(1000, 1000);
const groundMat = new THREE.MeshLambertMaterial({ color: 0x228822 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const runwayGeo = new THREE.PlaneGeometry(10, 200);
const runwayMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
const runway = new THREE.Mesh(runwayGeo, runwayMat);
runway.rotation.x = -Math.PI / 2;
scene.add(runway);

// Basit şehir manzarası
function createCity() {
  const blockSize = 20;
  for (let x = -500; x <= 5000; x += blockSize) {
    for (let z = -500; z <= 500; z += blockSize) {
      if (Math.random() < 0.10) {
        const h = 10 + Math.random() * 40;
        const geo = new THREE.BoxGeometry(blockSize, h, blockSize);
        // Rastgele pastel tonlarda renk oluştur
        const hue = Math.random();
        const sat = 0.3 + Math.random() * 0.4;
        const light = 0.5;
        const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, sat, light) });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        scene.add(mesh);
      }
    }
  }
}
createCity();

// Atmosferik efekt: gökyüzü rengi ve sis
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.00025);

// GLTFLoader ile harita ve uçak modellerini yüklüyoruz
const gltfLoader = new THREE.GLTFLoader();
let mapModel = null, planeGLTF = null;
// Harita modeli (models/map.glb yoluna kendi modelinizi koyun)
gltfLoader.load('/models/map.glb', gltf => {
  mapModel = gltf.scene;
  scene.add(mapModel);
}, undefined, error => console.error('Harita yüklenemedi:', error));
// Uçak modeli (models/plane.glb yoluna kendi uçak modelinizi koyun)
gltfLoader.load('/models/plane.glb', gltf => {
  planeGLTF = gltf.scene;
}, undefined, error => console.error('Uçak modeli yüklenemedi:', error));

// Uçak oluşturma fonksiyonu ve kontrolleri
function createPlane(color) {
  const plane = new THREE.Group();
  const fuselageGeom = new THREE.BoxGeometry(4, 1, 8);
  const fuselageMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 });
  const fuselage = new THREE.Mesh(fuselageGeom, fuselageMat);
  // Gövde kenar çizgisi
  const fuselageEdges = new THREE.EdgesGeometry(fuselageGeom);
  fuselage.add(new THREE.LineSegments(fuselageEdges, new THREE.LineBasicMaterial({ color: 0x000000 })));
  plane.add(fuselage);
  const wingGeom = new THREE.BoxGeometry(12, 0.5, 2);
  const wingMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 });
  const wing = new THREE.Mesh(wingGeom, wingMat);
  // Kanat kenar çizgisi
  const wingEdges = new THREE.EdgesGeometry(wingGeom);
  wing.add(new THREE.LineSegments(wingEdges, new THREE.LineBasicMaterial({ color: 0x000000 })));
  wing.position.set(0, 0, 0);
  plane.add(wing);
  const tailGeom = new THREE.BoxGeometry(1, 1, 3);
  const tail = new THREE.Mesh(tailGeom, fuselageMat);
  // Kuyruk kenar çizgisi
  const tailEdges = new THREE.EdgesGeometry(tailGeom);
  tail.add(new THREE.LineSegments(tailEdges, new THREE.LineBasicMaterial({ color: 0x000000 })));
  tail.position.set(0, 1, -4);
  plane.add(tail);
  scene.add(plane);
  return plane;
}

// Kullanıcı veri yapısı ve 2D isim etiketi oluşturucu
let localPlayersData = {};
function createLabel(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.font = '24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(name, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 1, 1);
  return sprite;
}

// Multiplayer için socket.io bağlantısı
const socket = io();
const planes = {};
let selfId;

// Login overlay işlemleri
document.getElementById('joinBtn').addEventListener('click', () => {
  const name = document.getElementById('usernameInput').value.trim();
  if (!name) return;
  socket.emit('join', { name });
  document.getElementById('loginOverlay').style.display = 'none';
});

// Kullanıcı listesi güncelleme fonksiyonu
function updateUserList(playersData) {
  const div = document.getElementById('userList');
  div.innerHTML = '<b>Oyuncular:</b><br>' + Object.values(playersData).map(p => p.name).join('<br>');
}

// Yeni uçak ekleme fonksiyonu (isim etiketi dahil)
function addPlane(id, data) {
  const plane = createPlane(data.color);
  plane.userData.color = data.color;
  plane.userData.name = data.name;
  plane.position.set(data.position.x, data.position.y, data.position.z);
  plane.rotation.y = data.rotationY;
  if (data.name) {
    const label = createLabel(data.name);
    label.position.set(0, 1.5, 0);
    plane.add(label);
  }
  scene.add(plane);
  planes[id] = plane;
  plane.userData.flying = false;
}

// Olay dinleyicileri
socket.on('connect', () => { selfId = socket.id; });

socket.on('current-players', playersData => {
  localPlayersData = { ...playersData };
  Object.entries(playersData).forEach(([id, data]) => addPlane(id, data));
  updateUserList(localPlayersData);
});

socket.on('new-player', data => {
  localPlayersData[data.id] = data;
  addPlane(data.id, data);
  updateUserList(localPlayersData);
});

socket.on('player-moved', data => {
  const planeInst = planes[data.id];
  if (planeInst) {
    planeInst.position.set(data.position.x, data.position.y, data.position.z);
    planeInst.rotation.y = data.rotationY;
  }
});

socket.on('player-disconnected', id => {
  delete localPlayersData[id];
  updateUserList(localPlayersData);
  const planeInst = planes[id];
  if (planeInst) {
    scene.remove(planeInst);
    delete planes[id];
  }
});

const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function updatePlane(plane, forward, backward, left, right, delta) {
  const moveSpeed = 50;
  const rotSpeed = Math.PI;
  if (keys[forward]) plane.translateZ(moveSpeed * delta);
  if (keys[backward]) {
    // S tuşuna basılınca uçağı aşağı indir
    plane.position.y = Math.max(1, plane.position.y - moveSpeed * delta * 0.2);
  }
  if (keys[left]) plane.rotation.y += rotSpeed * delta;
  if (keys[right]) plane.rotation.y -= rotSpeed * delta;
  // Sürekli kalkış gücü ve basit yerçekimi
  if (keys[forward]) {
    plane.position.y += moveSpeed * delta * 0.2;
  } else if (plane.position.y > 1) {
    plane.position.y = Math.max(1, plane.position.y - 9.8 * delta);
  }
}

// Renderer ayarları
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);

// Kamera (sadece yerel oyuncu için)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, -10);

// Animasyon döngüsü
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const localPlane = planes[selfId];
  if (localPlane) {
    updatePlane(localPlane, 'w', 's', 'a', 'd', delta);
    // Pitch smoothing: kalkışta burnu kaldır, değilse sıfıra döndür
    if (keys['w']) {
      localPlane.rotation.x = THREE.MathUtils.lerp(localPlane.rotation.x, -0.2, 0.05);
    } else {
      localPlane.rotation.x = THREE.MathUtils.lerp(localPlane.rotation.x, 0, 0.05);
    }
    // Kamera konumunu dünya eksenine göre plane pozisyonu etrafında takip et
    const offset = new THREE.Vector3(0, 5, -10).add(localPlane.position);
    camera.position.lerp(offset, 0.1);
    // Kamera bakış yönünü uçağın pozisyonuna çevir (sadece position takip)
    camera.lookAt(localPlane.position);
    socket.emit('player-update', {
      position: {
        x: localPlane.position.x,
        y: localPlane.position.y,
        z: localPlane.position.z
      },
      rotationY: localPlane.rotation.y,
      color: localPlane.userData.color
    });
  }

  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
}

// Pencere yeniden boyutlandırıldığında kamera ve renderer güncellemesi
function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onWindowResize);

// Başlat
animate(); 