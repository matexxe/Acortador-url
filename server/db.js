const fs = require("fs").promises; // Módulo para trabajar con el sistema de archivos usando Promesas
const path = require("path"); // Módulo para manejar rutas de archivos
const { promisify } = require("util"); // Para convertir funciones de callback a Promesas
const lockfile = require("lockfile"); // Para bloquear archivos y evitar lecturas/escrituras simultáneas

// Ruta al archivo JSON donde se guardan los datos de URLs
const dataPath = path.join(__dirname, "data", "urls.json");
// Ruta del archivo de bloqueo
const lockPath = dataPath + ".lock";

// Se convierten las funciones de lockfile a versión con Promesas
const lock = promisify(lockfile.lock);
const unlock = promisify(lockfile.unlock);

// Inicializa la base de datos (archivo JSON)
async function initDB() {
  try {
    // Crea la carpeta 'data' si no existe
    await fs.mkdir(path.dirname(dataPath), { recursive: true });

    // Verifica si el archivo existe
    await fs.access(dataPath);
  } catch {
    // Si no existe, lo crea con estructura vacía
    await fs.writeFile(
      dataPath,
      JSON.stringify({ urls: [], codes: {} }, null, 2)
    );
  }
}

// Lee la base de datos desde el archivo JSON
async function readDB() {
  try {
    // Bloquea el archivo para evitar conflictos concurrentes
    await lock(lockPath, { wait: 1000 });

    // Lee el archivo, si falla devuelve estructura vacía por defecto
    const data = await fs
      .readFile(dataPath, "utf8")
      .catch(() => '{"urls":[],"codes":{}}');

    return JSON.parse(data);
  } finally {
    // Libera el bloqueo aunque ocurra un error
    await unlock(lockPath).catch(() => {});
  }
}

// Escribe datos nuevos en el archivo JSON
async function writeDB(data) {
  try {
    await lock(lockPath, { wait: 1000 }); // Bloquea
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2)); // Escribe
  } finally {
    await unlock(lockPath).catch(() => {}); // Desbloquea
  }
}

// Busca una URL original en la base de datos
async function findUrl(originalUrl) {
  const db = await readDB();
  return db.urls.find((item) => item.original === originalUrl);
}

// Busca una URL original a partir del código corto
async function findCode(shortCode) {
  const db = await readDB();
  return db.codes[shortCode];
}

// Guarda una nueva URL (con su código corto)
async function saveUrl(urlData) {
  const db = await readDB();

  db.urls.push(urlData); // Agrega al array de URLs
  db.codes[urlData.code] = urlData.original; // Agrega al objeto de códigos

  await writeDB(db); // Guarda los cambios
  return urlData;
}

// Registra un clic en una URL acortada
async function registerClick(code) {
  const db = await readDB();
  const url = db.urls.find((item) => item.code === code);

  if (url) {
    url.clicks = (url.clicks || 0) + 1; // Incrementa contador de clics
    await writeDB(db); // Guarda los cambios
  }
}

// Exporta las funciones para que puedan usarse en otros archivos
module.exports = {
  initDB,
  findUrl,
  findCode,
  saveUrl,
  registerClick,
};
