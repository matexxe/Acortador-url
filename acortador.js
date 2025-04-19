const express = require("express");
const {
  initDB,
  findUrl,
  findCode,
  saveUrl,
  registerClick,
} = require("./server/db");
const helmet = require("helmet");
const validator = require("validator");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", 1);

// Configuración de entorno
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;

// Middlewares globales
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(helmet());
app.use(express.json({ limit: "10kb" }));

// Límite de peticiones para acortar URLs
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Demasiadas solicitudes desde esta IP",
});
app.use("/api/shorten", limiter);

// Función para validar URLs
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
    return new URL(url).toString();
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

    const validatedUrl = validateUrl(originalUrl);
    const existing = await findUrl(validatedUrl);

    if (existing) {
      return res.json({
        originalUrl: existing.original,
        shortUrl: existing.short,
        code: existing.code,
      });
    }

    let code;
    do {
      code = Math.random().toString(36).substring(2, 8);
    } while (await findCode(code));

    const shortUrl = `${BASE_URL}/r/${code}`;
    const urlData = {
      original: validatedUrl,
      short: shortUrl,
      code,
      createdAt: new Date().toISOString(),
      clicks: 0,
    };

    await saveUrl(urlData);

    res.status(201).json({
      originalUrl: validatedUrl,
      shortUrl,
      code,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Error al procesar la URL" });
  }
});

// Middleware para permitir redirección de imágenes desde otros orígenes
app.use("/r/:code", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

// Endpoint para redirigir desde una URL corta
app.get("/r/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const originalUrl = await findCode(code);

    if (!originalUrl) {
      return res.status(404).send("URL no encontrada");
    }

    await registerClick(code);
    res.redirect(302, originalUrl);
  } catch (err) {
    console.error("Error en redirección:", err);
    res.status(500).send("Error interno del servidor");
  }
});

// Iniciar servidor
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Error al iniciar:", err);
  process.exit(1);
});
