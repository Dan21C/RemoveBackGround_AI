# Conversor de Video · Fondo Inteligente

Herramienta web local que convierte videos `.mov`, `.mp4` o `.webm` a **WebM VP9 con canal alpha** (transparencia), ya sea removiendo el fondo con IA o preservando la transparencia existente del archivo original.

---

## Características

- **Remoción de fondo con IA** — usa modelos de segmentación neuronal (BIRefNet, ISNet, U2Net) para detectar el sujeto y eliminar el fondo cuadro a cuadro.
- **Conversión directa** — convierte archivos `.mov` con alpha premultiplicado (After Effects, Motion) a WebM sin perder la transparencia.
- **Limpieza de bordes** — alpha matting + despill gaussiano para eliminar el halo oscuro típico de los bordes después de la remoción.
- **Progreso en tiempo real** — barra de progreso de subida (XHR) y de conversión frame a frame (Server-Sent Events).
- **Calidad configurable** — CRF, ancho máximo y elección de modelo de IA.
- **Preview y descarga** — visualización con fondo tipo checkerboard y snippet HTML listo para copiar.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.14 · Flask 3 |
| Remoción de fondo | rembg + onnxruntime |
| Modelos IA | BIRefNet · ISNet · U2Net · Silueta |
| Post-procesado | Pillow · NumPy · SciPy |
| Codificación de video | FFmpeg (libvpx-vp9 · yuva420p) |
| Frontend | HTML · CSS · JavaScript vanilla |

---

## Requisitos

- Python 3.9 o superior
- FFmpeg instalado y disponible en el PATH
- ~2 GB de espacio en disco (modelos de IA se descargan automáticamente la primera vez)

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/Dan21C/RemoveBackGround_AI.git
cd RemoveBackGround_AI

# 2. Crear entorno virtual
python -m venv venv

# 3. Activar el entorno
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# 4. Instalar dependencias
pip install flask "rembg[cpu]"

# 5. Instalar FFmpeg
# Windows (winget):
winget install --id Gyan.FFmpeg
# macOS (Homebrew):
brew install ffmpeg
# Linux (apt):
sudo apt install ffmpeg
```

---

## Uso

```bash
python app.py
```

Abrir el navegador en **http://localhost:5000**

---

## Modos de operación

### Remover fondo y exportar WebM transparente
Extrae cada frame del video, aplica el modelo de IA para obtener una máscara de segmentación, limpia los bordes con alpha matting y reensambla todo como WebM VP9 con canal alpha.

### Solo convertir MOV con transparencia existente
Para videos exportados desde After Effects, Motion u otras herramientas que ya incluyen canal alpha. Aplica limpieza de bordes (despill + recorte de 1px) para eliminar el halo oscuro causado por el alpha premultiplicado, y recodifica como WebM.

---

## Modelos de IA disponibles

| Modelo | Descripción |
|---|---|
| `birefnet-general` | Mejor calidad general. Recomendado. |
| `birefnet-portrait` | Optimizado para retratos y personas. |
| `isnet-general-use` | Buen balance calidad/velocidad. |
| `u2net` | Uso general, más rápido. |
| `u2netp` | Versión liviana de U2Net. |
| `silueta` | Especializado en siluetas de personas. |

Los modelos se descargan automáticamente desde Hugging Face la primera vez que se usan y quedan cacheados localmente.

---

## Estructura del proyecto

```
.
├── app.py                  # Backend Flask (API + procesado)
├── requirements.txt        # Dependencias Python
├── templates/
│   └── index.html          # Interfaz web
├── static/
│   ├── styles.css          # Estilos
│   └── app.js              # Lógica frontend
├── uploads/                # Archivos temporales (se limpian automáticamente)
└── outputs/                # Videos procesados
```

---

## Cómo funciona (modo remoción de fondo)

```
Video original
      │
      ▼
Extracción de frames (FFmpeg)
      │
      ▼
Remoción de fondo por frame (rembg + alpha matting)
      │
      ▼
Limpieza de bordes (despill gaussiano + erosión de alpha)
      │
      ▼
Recodificación WebM VP9 con alpha (FFmpeg libvpx-vp9)
      │
      ▼
Video WebM transparente listo para web
```

---

## Variables de entorno

No se requieren variables de entorno. La app corre localmente en el puerto **5000** por defecto.

Para cambiar el puerto:

```bash
# En app.py, última línea:
app.run(host="0.0.0.0", port=8080)
```

---

## Licencia

© 2026 Daniel Felipe Castañeda. Todos los derechos reservados.
