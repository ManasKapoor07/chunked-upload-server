const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Swagger setup
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Chunked File Upload API",
      version: "1.0.0",
      description: "API for uploading large files in chunks and merging them",
    },
    servers: [{ url: `http://localhost:${PORT}` }],
  },
  apis: [__filename], // swagger from inline comments in this file
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const filename = req.query.filename;
    if (!filename) return cb(new Error("Missing filename query param"), null);
    const chunkDir = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir);
    cb(null, chunkDir);
  },
  filename: (req, file, cb) => {
    const chunkIndex = req.query.chunkIndex;
    if (chunkIndex === undefined) return cb(new Error("Missing chunkIndex"), null);
    cb(null, chunkIndex);
  },
});

const upload = multer({ storage });

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload a single chunk
 *     parameters:
 *       - in: query
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique session filename for the upload
 *       - in: query
 *         name: chunkIndex
 *         required: true
 *         schema:
 *           type: string
 *         description: Index of the chunk being uploaded
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               chunk:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Chunk received
 */
app.post("/upload", upload.single("chunk"), (req, res) => {
  res.json({ status: "Chunk received" });
});

/**
 * @swagger
 * /merge:
 *   post:
 *     summary: Merge all uploaded chunks into a single file
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filename:
 *                 type: string
 *               totalChunks:
 *                 type: integer
 *               originalFilename:
 *                 type: string
 *     responses:
 *       200:
 *         description: File merged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 downloadUrl:
 *                   type: string
 *       400:
 *         description: Missing chunk
 */
app.post("/merge", async (req, res) => {
  const { filename, totalChunks, originalFilename } = req.body;
  const chunkDir = path.join(UPLOAD_DIR, filename);
  const finalPath = path.join(UPLOAD_DIR, `${filename}_merged_${originalFilename}`);

  const writeStream = fs.createWriteStream(finalPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(chunkDir, `${i}`);
    if (!fs.existsSync(chunkPath)) {
      return res.status(400).json({ error: `Missing chunk: ${i}` });
    }
    const data = fs.readFileSync(chunkPath);
    writeStream.write(data);
  }

  writeStream.end(() => {
    res.json({
      message: "File merged",
      downloadUrl: `/download/${filename}_merged_${originalFilename}`,
    });
  });
});

/**
 * @swagger
 * /download/{filename}:
 *   get:
 *     summary: Download the merged file
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the merged file
 *     responses:
 *       200:
 *         description: File downloaded
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: File not found
 */
app.get("/download/:filename", (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📄 Swagger docs at http://localhost:${PORT}/api-docs`);
});

