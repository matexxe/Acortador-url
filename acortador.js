// Carga variables de entorno desde un archivo .env
require("dotenv").config();

const express = require("express");
const {
  initDB,
  findUrl,
  findCode,
  saveUrl,
  registerClick,
} = require("./server/db"); // Funciones para manejo de URLs en archivo JSON
const helmet = require("helmet"); // Seguridad HTTP
const validator = require("validator"); // Validación de URLs
const cors = require("cors"); // Permitir peticiones desde otro origen (CORS)
const rateLimit = require("express-rate-limit"); // Límite de solicitudes por IP

const app = express();
app.set('trust proxy', true);

// Configuración de entorno
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;

// Middlewares globales
app.use(
  cors({
    origin: process.env.FRONTEND_URL, // Solo permite peticiones desde esta URL
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(helmet()); // Aplica medidas de seguridad en las cabeceras HTTP
app.use(express.json({ limit: "10kb" })); // Limita el tamaño del body a 10kb para evitar abuso

// Límite de peticiones a la ruta de acortado (100 por 15 minutos)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Máximo 100 peticiones por IP
  message: "Demasiadas solicitudes desde esta IP",
});
app.use("/api/shorten", limiter); // Se aplica solo a la ruta de acortar URLs

// Función para validar URLs correctamente formadas y con protocolo
function validateUrl(url) {
  if (
    !validator.isURL(url, {
      require_protocol: true,
      protocols: ["http", "https"],
    })
  ) {
    throw new Error("URL inválida. Debe incluir http:// o https://");
  }

  try {
    return new URL(url).toString(); // Asegura que la URL sea válida y bien formada
  } catch {
    throw new Error("URL mal formada");
  }
}

// Endpoint para acortar una URL
app.post("/api/shorten", async (req, res) => {
  try {
    const { originalUrl } = req.body;

    if (!originalUrl) {
      return res.status(400).json({ error: "Se requiere una URL" });
    }

    const validatedUrl = validateUrl(originalUrl); // Valida la URL
    const existing = await findUrl(validatedUrl); // Revisa si ya existe en la base

    if (existing) {
      // Si ya fue acortada, la devuelve
      return res.json({
        originalUrl: existing.original,
        shortUrl: existing.short,
        code: existing.code,
      });
    }

    // Genera un código corto aleatorio de 6 caracteres
    let code;
    do {
      code = Math.random().toString(36).substring(2, 8); // ej: "a1b2c3"
    } while (await findCode(code)); // Reintenta si ya existe ese código

    const shortUrl = `${BASE_URL}/r/${code}`; // Construye la URL corta
    const urlData = {
      original: validatedUrl,
      short: shortUrl,
      code,
      createdAt: new Date().toISOString(),
      clicks: 0,
    };

    await saveUrl(urlData); // Guarda en la "base de datos" (archivo JSON)

    res.status(201).json({
      originalUrl: validatedUrl,
      shortUrl,
      code,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Error al procesar la URL" });
  }
});

// Endpoint para redirigir desde una URL corta a la original
app.get("/r/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const originalUrl = await findCode(code); // Busca la URL original por el código

    if (!originalUrl) {
      // Si no existe, muestra error 404 en HTML
      return res.status(404).send(`
        <html>
          <body>
            <h1>404 - URL no encontrada</h1>
            <p>El enlace acortado no existe o ha expirado</p>
          </body>
        </html>
      `);
    }

    await registerClick(code); // Registra un clic más en la estadística
    res.redirect(302, originalUrl); // Redirige al destino original
  } catch (err) {
    console.error("Error en redirección:", err);
    res.status(500).send("Error interno del servidor");
  }
});

// Inicia el servidor y prepara la "base de datos"
async function start() {
  await initDB(); // Crea el archivo JSON si no existe
  app.listen(PORT, () => {
    console.log(`Servidor escuchando el puerto ${PORT}`);
  });
}

// Arranca el servidor
start().catch((err) => {
  console.error("Error al iniciar:", err);
  process.exit(1); // Finaliza si falla
});
