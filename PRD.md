# Documento de Requisitos del Producto (PRD): Slidev MCP Server

## 1. Resumen Ejecutivo

El **Slidev MCP Server** es una integración que permite a los Agentes de IA (como Claude, u otros clientes compatibles con MCP) crear, editar y exportar presentaciones de diapositivas de manera autónoma. Aprovechando la sintaxis basada en Markdown de [Slidev](https://sli.dev/), este servidor expone herramientas para que la IA estructure el contenido, aplique estilos y compile el resultado final sin que el usuario tenga que escribir código manualmente.

## 2. Objetivos del Proyecto

* **Facilitar la creación de presentaciones:** Permitir que los usuarios soliciten presentaciones complejas en lenguaje natural y la IA genere los archivos listos para proyectar.
* **Estandarización:** Utilizar el Model Context Protocol (MCP) para garantizar que el servidor pueda ser consumido por cualquier agente o LLM compatible.
* **Control granular:** Proveer herramientas de edición para que la IA no solo cree un archivo desde cero, sino que pueda añadir, modificar o eliminar diapositivas específicas basándose en el feedback del usuario.

### No Objetivos (Fuera de alcance inicial)

* Alojamiento en la nube de las presentaciones generadas (se ejecutará en local).
* Generación de assets visuales complejos (imágenes o videos) desde cero (la IA solo insertará las rutas o URLs en el Markdown).

## 3. Casos de Uso y Perfiles de Usuario

**Usuario Objetivo:** Desarrolladores, educadores, gerentes de producto o investigadores que usan asistentes de IA locales/de escritorio para optimizar su flujo de trabajo.

**Historias de Usuario:**

1. *Como usuario*, quiero decirle a mi IA "Crea una presentación de 5 slides sobre la historia de la computación cuántica", y que la IA inicialice el proyecto y escriba el contenido con el formato correcto de Slidev.
2. *Como usuario*, quiero pedirle a la IA "Cambia el tema de la presentación a uno oscuro y añade una diapositiva con una tabla de comparación al final".
3. *Como usuario*, quiero indicarle a la IA "Exporta la presentación actual a PDF para enviársela a mi equipo".

## 4. Requisitos Funcionales (Herramientas MCP a exponer)

El servidor MCP debe registrar e implementar las siguientes herramientas (Tools) para que el agente de IA las consuma:

### 4.1. `init_presentation`

* **Descripción:** Inicializa un nuevo directorio de proyecto Slidev.
* **Parámetros:**
* `project_name` (string): Nombre de la carpeta.
* `theme` (string, opcional): Tema de Slidev (ej. `default`, `seriph`).
* `title` (string): Título para el Frontmatter.


* **Acción:** Crea la estructura básica, instala dependencias (`npm i @slidev/cli`) y genera un archivo `slides.md` con el encabezado YAML (Frontmatter) inicial.

### 4.2. `add_slide`

* **Descripción:** Añade una nueva diapositiva al final de la presentación actual (o en un índice específico).
* **Parámetros:**
* `content` (string): El contenido en Markdown de la diapositiva, utilizando la [sintaxis de Slidev](https://sli.dev/guide/syntax) (incluyendo componentes Vue si es necesario).
* `layout` (string, opcional): El layout a utilizar (ej. `cover`, `center`, `two-cols`).
* `index` (number, opcional): Posición donde insertar la diapositiva.


* **Acción:** Modifica el archivo `slides.md` insertando el delimitador `---` y el contenido proporcionado por la IA.

### 4.3. `update_slide`

* **Descripción:** Sobrescribe el contenido de una diapositiva existente.
* **Parámetros:**
* `slide_number` (number): El número de la diapositiva a modificar.
* `new_content` (string): El nuevo contenido en Markdown.


* **Acción:** Analiza el archivo `slides.md`, localiza el bloque correspondiente separando por `---`, y reemplaza el texto.

### 4.4. `export_presentation`

* **Descripción:** Compila la presentación a un formato estático o PDF.
* **Parámetros:**
* `format` (enum: `pdf`, `spa`, `png`): El formato de salida deseado.


* **Acción:** Ejecuta el comando CLI de Slidev (ej. `npx slidev export`) y devuelve la ruta del archivo generado.

## 5. Requisitos No Funcionales

* **Entorno de Ejecución:** El servidor MCP debe estar escrito preferiblemente en TypeScript/Node.js, dado que Slidev pertenece al ecosistema de JavaScript/Vue.
* **Seguridad:** El servidor debe restringir la lectura y escritura de archivos estrictamente al directorio del proyecto inicializado. No debe permitir que la IA acceda a directorios superiores del sistema del usuario.
* **Validación de Sintaxis:** Antes de escribir en `slides.md`, el servidor debe validar que el texto proporcionado por el LLM no rompa la estructura del documento (por ejemplo, asegurando que los bloques YAML de configuración por diapositiva estén bien formados).

## 6. Arquitectura Técnica

1. **Agente IA (Cliente MCP):** Analiza el prompt del usuario y decide qué herramientas llamar. Conoce la sintaxis de Markdown y la estructura de una presentación.
2. **Slidev MCP Server:** Escucha las llamadas a las funciones a través del protocolo STDIO o SSE.
3. **Gestor de Archivos (Local):** El servidor MCP interactúa con el sistema de archivos (File System) para leer/escribir `slides.md`.
4. **Slidev CLI:** El servidor ejecuta comandos locales de Slidev por debajo para hacer *builds* o *exports*.
