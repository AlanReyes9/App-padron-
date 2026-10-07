const MENSAJES: Record<string, string> = {
  CREDENCIALES: "Usuario o contraseña incorrectos.",
  INACTIVO: "Esta cuenta está desactivada. Contacta al administrador.",
  BLOQUEADO: "Demasiados intentos fallidos. Espera 10 minutos e inténtalo de nuevo.",
  NO_AUTORIZADO: "Tu sesión expiró. Inicia sesión nuevamente.",
  SOLO_ADMIN: "Solo el administrador puede realizar esta acción.",
  CEDULA_INVALIDA: "La cédula debe tener 11 dígitos.",
  DATOS_INCOMPLETOS: "Completa todos los campos obligatorios.",
  SECTOR_INVALIDO: "Selecciona una provincia y un sector válidos.",
  USUARIO_DUPLICADO: "Ese nombre de usuario ya está en uso.",
  PASSWORD_ACTUAL: "La contraseña actual no es correcta.",
  PASSWORD_CORTA: "La contraseña debe tener al menos 6 caracteres.",
  LOGO_GRANDE: "El logo es demasiado grande. Usa una imagen más liviana.",
  SECTOR_DUPLICADO: "Ese sector ya existe en esa provincia.",
  SECTOR_EN_USO: "No se puede eliminar: hay votantes registrados en ese sector.",
  NO_ENCONTRADO: "El registro no existe o no tienes permiso sobre él.",
};

export function mensajeError(raw: string): string {
  if (raw.startsWith("CEDULA_DUPLICADA")) return "Esta cédula ya está registrada en el sistema.";
  return MENSAJES[raw] ?? "Ocurrió un error inesperado. Inténtalo de nuevo.";
}
