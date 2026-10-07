# Instalación en servidor propio con PostgreSQL local

Sistema de padrón para comités de base: página pública de consulta por cédula, panel de administrador y coordinadores, y exportación del padrón a Excel.

## Requisitos

| Programa | Versión |
|---|---|
| Node.js | 20 o superior (recomendado 22 LTS) |
| PostgreSQL | 14 o superior (con la extensión `pgcrypto`, incluida por defecto) |
| Sistema | Linux (Ubuntu/Debian), Windows o macOS |

## 1. Base de datos

Crea un usuario y una base de datos (en Linux, como usuario `postgres`):

```bash
sudo -u postgres psql -c "CREATE USER padron WITH PASSWORD 'CAMBIA_ESTA_CLAVE';"
sudo -u postgres psql -c "CREATE DATABASE padron OWNER padron;"
sudo -u postgres psql -c "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;"
```

> Los roles `anon` y `authenticated` no tienen acceso a nada; solo existen para que el script sea compatible con Supabase.

Instala tablas, funciones, los 700 sectores y el usuario **admin** (elige su contraseña en `admin_clave`):

```bash
psql "postgresql://padron:CAMBIA_ESTA_CLAVE@localhost:5432/padron" -v admin_clave='TuClaveDeAdmin' -f database/instalar.sql
```

**Opcional — traer los datos que ya tienes en línea** (usuarios, votantes; el admin queda con su misma contraseña de la versión en línea):

```bash
psql "postgresql://padron:CAMBIA_ESTA_CLAVE@localhost:5432/padron" -f database/datos_actuales.sql
```

> Ambos scripts se pueden ejecutar varias veces sin borrar datos.
> Si usas **pgAdmin**: abre `database/instalar.sql` en la herramienta de consultas, reemplaza `:'admin_clave'` (al final del archivo) por tu clave entre comillas simples, por ejemplo `'MiClave123'`, y ejecútalo.

## 2. Aplicación

```bash
cd padron                 # carpeta descomprimida
cp .env.example .env.local
nano .env.local           # pon tu DATABASE_URL (usuario, clave y base de arriba)
npm ci                    # instala dependencias
npm run build             # compila
npm start                 # inicia en http://localhost:3000
```

Entra con usuario `admin` y la clave que elegiste. Cámbiala en **Mi perfil** y configura el nombre del comité en **Configuración**.

> **¿Sin HTTPS?** Si vas a acceder por `http://` (por ejemplo `http://192.168.1.10:3000` en una red local), agrega `COOKIE_SECURE=false` en `.env.local`; si no, el inicio de sesión no se mantendrá. Con HTTPS no hace falta.

## 3. Dejarlo funcionando siempre (Linux)

### Con systemd

```bash
sudo cp -r padron /opt/padron && sudo useradd -r padron && sudo chown -R padron /opt/padron
sudo cp /opt/padron/deploy/padron.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now padron
sudo systemctl status padron
```

### Publicarlo con dominio y HTTPS (Nginx)

```bash
sudo cp deploy/nginx-padron.conf /etc/nginx/sites-available/padron
sudo nano /etc/nginx/sites-available/padron        # pon tu dominio
sudo ln -s /etc/nginx/sites-available/padron /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d padron.tudominio.com        # certificado HTTPS gratuito
```

### Alternativa con PM2

```bash
npm i -g pm2
pm2 start npm --name padron -- start
pm2 save && pm2 startup
```

## 4. Copias de seguridad

```bash
# Respaldo diario (agrégalo a cron)
pg_dump "postgresql://padron:CLAVE@localhost:5432/padron" -Fc -f /respaldos/padron-$(date +%F).dump
# Restaurar
pg_restore -d "postgresql://padron:CLAVE@localhost:5432/padron" --clean /respaldos/padron-AAAA-MM-DD.dump
```

## 5. Actualizar a una versión nueva

Reemplaza los archivos (conserva `.env.local`), vuelve a ejecutar `database/instalar.sql` (actualiza funciones sin borrar datos) y luego `npm ci && npm run build` y reinicia el servicio.

## Estructura

```
src/                  Código de la aplicación (Next.js)
public/logo-prm.png   Logo por defecto
database/
  instalar.sql        Esquema completo + sectores + usuario admin
  datos_actuales.sql  Tus datos exportados de la versión en línea
deploy/               Ejemplos de systemd y Nginx
data/                 Fuentes y generador del catálogo de sectores
.env.example          Variables de configuración
```

## Seguridad

- Toda la lógica de permisos está en funciones de PostgreSQL (`fn_*`): un coordinador solo puede ver y modificar sus votantes, y la cédula es única en todo el sistema.
- Las contraseñas se guardan cifradas con bcrypt; tras 5 intentos fallidos la cuenta se bloquea 10 minutos.
- La consulta pública solo muestra nombre completo, cédula y el coordinador que lo registró.
- Usa HTTPS en producción y una contraseña fuerte para el usuario de PostgreSQL.
