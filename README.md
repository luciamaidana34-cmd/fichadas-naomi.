# Fichadas Naomi

Aplicación web inicial conectada a la base Airtable **Fichadas Naomi**.

## Qué incluye
- Fichaje de entrada y salida con fecha/hora del servidor.
- Bloqueo de una segunda entrada si hay una jornada abierta.
- Calendario mensual e historial diario.
- Distribución de jornadas entre días calendario.
- Cálculo nocturno (19:00–09:00), diurno (09:00–19:00) y total.
- Vista administrativa protegida por una clave distinta, con correcciones y motivo registrado.

## Importante antes de usar
Este paquete contiene el código, pero **todavía no está publicado en Internet ni conectado en producción**. Para que Naomi pueda usar un enlace real, hay que desplegarlo en un servicio de hosting y cargar las variables de entorno. No compartas el token de Airtable ni lo pegues en el código del navegador.

## Configuración
1. Crear un token personal de Airtable con permisos de lectura y escritura sobre la base `Fichadas Naomi`.
2. Copiar `.env.example` como `.env`.
3. Completar `AIRTABLE_TOKEN`.
4. Cambiar `APP_KEY` y `ADMIN_KEY` por dos claves largas, diferentes y aleatorias.
5. Instalar dependencias con `npm install`.
6. Ejecutar localmente con `npm start`.
7. Desplegar el proyecto en un hosting compatible con Node.js (por ejemplo, Render, Railway o similar) y cargar allí las mismas variables de entorno.

## Enlaces
- Naomi: `https://TU-DOMINIO/TU_APP_KEY`
- RRHH: `https://TU-DOMINIO/TU_ADMIN_KEY?admin=1`

La clave de Naomi funciona como llave privada del enlace, no como verificación de identidad. Si alguien reenvía ese enlace, otra persona podría utilizarlo.

## Airtable esperado
Base ID: `appmZY6en2wxjQp8a`  
Tabla: `Jornadas`

El servidor usa los nombres de campo ya definidos en la tabla:
`Registro`, `Persona`, `Entrada`, `Salida`, `Estado`, `Tipo de registro`, `Motivo / observaciones`, `Última modificación`.

## Zona horaria
El servidor guarda marcas de tiempo ISO. El navegador muestra la hora local del dispositivo. Configurá el hosting con `TZ=America/Argentina/Buenos_Aires` para mantener la zona horaria de Buenos Aires en las operaciones de cálculo diario.

## Alcance y revisión necesaria
- Probar entrada/salida, cruce de medianoche y cálculo de un turno de 18:00 a 10:00.
- Verificar los permisos del token y que la tabla mantenga exactamente los campos indicados.
- Antes de uso laboral real, revisar políticas internas de privacidad, conservación y acceso a registros.
