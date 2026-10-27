# Dekiller Companion — prototipo local

Versión inicial para Android + Termux, sin PC ni dependencias npm.

## Seguridad
- Escucha solo en `127.0.0.1`; no expongas el puerto a Internet.
- No necesita ni lee `.env` ni claves.
- Los datos se guardan en `data/memory.json`, dentro de este proyecto.
- Usa el modelo local de Ollama `qwen3:1.7b` por defecto.
- Si Ollama está apagado, el chat muestra un error claro; la interfaz y la memoria manual siguen disponibles.

## Instalar en Termux
Descomprime el ZIP y entra en la carpeta:
```bash
cd ~/proyectos/dekiller-companion
node --check server.js
npm start
```
Luego abre en el navegador del mismo teléfono:
`http://127.0.0.1:3040`

En otra sesión de Termux, si Ollama no está activo:
```bash
ollama serve
```
No cierres esa sesión mientras quieras usar el modelo. Para parar el servidor web, pulsa `Ctrl+C` en su sesión.

## Comprobar estado
En otra sesión:
```bash
curl -sS http://127.0.0.1:3040/api/health
```

## Copia de seguridad
Cierra el servidor y copia `data/memory.json` a un lugar privado. No subas ese archivo a GitHub si contiene recuerdos personales.

## Limitaciones de esta fase
No incluye todavía avatar 3D, micrófono, voz ni integración con Dekiller AI Core. Se añadirán después de probar el chat y la memoria.
