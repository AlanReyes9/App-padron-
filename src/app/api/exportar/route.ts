import ExcelJS from "exceljs";
import { configPublica, rpc } from "@/lib/api";
import { token, usuarioActual } from "@/lib/sesion";
import { formatoCedula, formatoTelefono } from "@/lib/formato";
import { LOGO_PRM } from "@/components/Marca";
import type { Coordinador, Votante } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const AZUL = "FF00478E";
const AZUL_OSCURO = "FF03295C";
const ORO = "FFE8A33D";
const ZEBRA = "FFF3F8FE";
const BORDE = { style: "thin" as const, color: { argb: "FFD3DDEF" } };

async function logoPrm(origen: string) {
  try {
    const res = await fetch(`${origen}${LOGO_PRM}`);
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const usuario = await usuarioActual();
  const t = await token();
  if (!usuario || !t) return new Response("No autorizado", { status: 401 });
  const admin = usuario.rol === "admin";

  const p = new URL(req.url).searchParams;
  const f = {
    provincia: p.get("provincia") || null,
    sector: p.get("sector") || null,
    circunscripcion: p.get("circunscripcion") || null,
    coordinador: admin ? p.get("coordinador") || null : null,
    q: p.get("q") || null,
  };

  const [cfg, votantes, coords] = await Promise.all([
    configPublica(),
    rpc<Votante[]>("fn_votantes", {
      p_token: t,
      p_provincia: f.provincia,
      p_sector: f.sector,
      p_circunscripcion: f.circunscripcion,
      p_coordinador: f.coordinador,
      p_q: f.q,
    }),
    admin && f.coordinador ? rpc<Coordinador[]>("fn_coordinadores", { p_token: t }) : Promise.resolve([] as Coordinador[]),
  ]);

  const nombreCoord = admin
    ? f.coordinador
      ? (coords.find((c) => c.id === f.coordinador)?.nombre ?? usuario.nombre)
      : "Todos"
    : usuario.nombre;

  const columnas = [
    { h: "No.", w: 6 },
    { h: "CÉDULA", w: 18 },
    { h: "NOMBRE", w: 20 },
    { h: "APELLIDO", w: 20 },
    { h: "TELÉFONO", w: 16 },
    { h: "DIRECCIÓN", w: 32 },
    { h: "PROVINCIA", w: 18 },
    { h: "SECTOR", w: 22 },
    { h: "CIRCUNSCRIPCIÓN", w: 17 },
    ...(admin ? [{ h: "COORDINADOR", w: 22 }] : []),
    { h: "FIRMA", w: 18 },
  ];
  const n = columnas.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = cfg.nombre_org;
  wb.created = new Date();
  const ws = wb.addWorksheet("Padrón", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: {
      paperSize: 5,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
      printTitlesRow: "7:7",
    },
    headerFooter: { oddFooter: `&L&8${cfg.nombre_org}&C&8Página &P de &N&R&8Generado el &D` },
  });
  ws.columns = columnas.map((c) => ({ width: c.w }));

  const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= n; c++) ws.getCell(r, c).fill = fill(AZUL_OSCURO);
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 18;

  const logo = cfg.logo?.startsWith("data:image/") ? cfg.logo : await logoPrm(new URL(req.url).origin);
  if (logo) {
    const ext = logo.slice(11, logo.indexOf(";")) === "jpeg" ? "jpeg" : "png";
    const id = wb.addImage({ base64: logo, extension: ext });
    ws.addImage(id, { tl: { col: 0.15, row: 0.15 }, ext: { width: 82, height: 82 } });
  }

  ws.mergeCells(1, 3, 1, n);
  const titulo = ws.getCell(1, 3);
  titulo.value = cfg.nombre_org.toUpperCase();
  titulo.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  titulo.alignment = { vertical: "middle", horizontal: "center" };

  ws.mergeCells(2, 3, 2, n);
  const lema = ws.getCell(2, 3);
  lema.value = cfg.lema;
  lema.font = { name: "Calibri", size: 12, italic: true, color: { argb: "FFBCD8FD" } };
  lema.alignment = { vertical: "middle", horizontal: "center" };

  ws.mergeCells(4, 1, 4, n);
  const banda = ws.getCell(4, 1);
  banda.value = "PADRÓN ELECTORAL";
  banda.font = { name: "Calibri", size: 14, bold: true, color: { argb: AZUL_OSCURO } };
  banda.alignment = { vertical: "middle", horizontal: "center" };
  banda.fill = fill(ORO);
  ws.getRow(4).height = 24;

  const fecha = new Date().toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "long", timeStyle: "short" });
  const filtrosTxt = [
    f.provincia && `Provincia: ${f.provincia}`,
    f.sector && `Sector: ${f.sector}`,
    f.circunscripcion && `Circunscripción: ${f.circunscripcion}`,
    f.q && `Búsqueda: "${f.q}"`,
  ].filter(Boolean).join("   ·   ") || "Sin filtros (listado completo)";
  const mitad = Math.ceil(n / 2);
  ws.mergeCells(5, 1, 5, mitad);
  ws.mergeCells(5, mitad + 1, 5, n);
  ws.mergeCells(6, 1, 6, n);
  ws.getCell(5, 1).value = { richText: [{ text: "Coordinador: ", font: { bold: true, color: { argb: AZUL } } }, { text: nombreCoord }] };
  ws.getCell(5, mitad + 1).value = { richText: [{ text: "Fecha de emisión: ", font: { bold: true, color: { argb: AZUL } } }, { text: fecha }] };
  ws.getCell(5, mitad + 1).alignment = { horizontal: "right" };
  ws.getCell(6, 1).value = { richText: [{ text: "Filtros: ", font: { bold: true, color: { argb: AZUL } } }, { text: filtrosTxt }] };
  ws.getRow(5).height = 20;
  ws.getRow(6).height = 20;
  for (const r of [5, 6]) ws.getRow(r).eachCell((c) => (c.font = { ...c.font, size: 10.5 }));

  const hr = ws.getRow(7);
  columnas.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, size: 10.5, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(AZUL);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
  });
  hr.height = 26;

  votantes.forEach((v, i) => {
    const valores = [
      i + 1,
      formatoCedula(v.cedula),
      v.nombre.toUpperCase(),
      v.apellido.toUpperCase(),
      formatoTelefono(v.telefono),
      v.direccion ?? "",
      v.provincia,
      v.sector,
      v.circunscripcion,
      ...(admin ? [v.coordinador] : []),
      "",
    ];
    const row = ws.addRow(valores);
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
      cell.alignment = { vertical: "middle", horizontal: col === 1 || col === 2 || col === 9 ? "center" : "left", wrapText: col === 6 };
      cell.font = { size: 10, ...(col === 2 ? { name: "Consolas" } : {}), ...(col === 3 || col === 4 ? { bold: true } : {}) };
      if (i % 2 === 1) cell.fill = fill(ZEBRA);
    });
  });
  if (votantes.length) ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + votantes.length, column: n } };

  const fin = ws.rowCount + 2;
  ws.mergeCells(fin, 1, fin, 4);
  const tot = ws.getCell(fin, 1);
  tot.value = `TOTAL DE VOTANTES: ${votantes.length.toLocaleString("es-DO")}`;
  tot.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  tot.fill = fill(AZUL);
  tot.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(fin).height = 24;

  const firma = fin + 3;
  ws.mergeCells(firma, n - 3, firma, n);
  const lf = ws.getCell(firma, n - 3);
  lf.value = "Firma del coordinador";
  lf.alignment = { horizontal: "center" };
  lf.font = { size: 10, color: { argb: "FF475569" } };
  lf.border = { top: { style: "thin", color: { argb: "FF0F1B33" } } };

  const buffer = await wb.xlsx.writeBuffer();
  const base = (admin && !f.coordinador ? "padron-general" : `padron-${nombreCoord}`)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const nombre = `${base}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
