"""Uso: python3 data/build_sectores.py data/fuentes/muni.json data/fuentes/sde.json data/sectores.json

Genera data/sectores.json: catálogo provincia -> sector -> circunscripción.

Fuentes:
- Municipios: Wikipedia "Municipios de la República Dominicana" (158 + La Victoria y La Caleta, 2024).
- Circunscripciones por municipio: JCE Resolución 04-2019 (vigente para 2020 y 2024).
- Barrios del Distrito Nacional (70) y sectores/barrios de Santo Domingo Este por circunscripción:
  Ayuntamiento del DN y Ayuntamiento de SDE.
"""
import json, sys

muni = json.load(open(sys.argv[1], encoding="utf-8"))
sde = json.load(open(sys.argv[2], encoding="utf-8"))

U = "Única"
def C(n): return f"Circunscripción {n}"

rows = {}
def add(prov, sector, circ):
    key = (prov, sector.lower())
    if key not in rows:
        rows[key] = {"provincia": prov, "sector": sector, "circunscripcion": circ}

# --- Municipios por circunscripción (JCE Res. 04-2019) ---
muni_circ = {
    "La Vega": {"La Vega": 1, "Jima Abajo": 1, "Constanza": 2, "Jarabacoa": 2},
    "Puerto Plata": {"Puerto Plata": 1, "Sosúa": 1, "Villa Montellano": 1, "Altamira": 2, "Guananico": 2,
                     "Imbert": 2, "Los Hidalgos": 2, "Luperón": 2, "Villa Isabela": 2},
    "San Cristóbal": {"San Cristóbal": 1, "Cambita Garabitos": 2, "Los Cacaos": 2, "Sabana Grande de Palenque": 2,
                      "Villa Altagracia": 2, "Yaguate": 2, "Haina": 3, "Nigua": 3},
    "Santiago": {"Villa Bisonó": 1, "Villa González": 1, "Baitoa": 2, "Jánico": 2, "Sabana Iglesia": 2,
                 "San José de las Matas": 2, "Licey al Medio": 3, "Puñal": 3, "Tamboril": 3},
    "Santo Domingo": {"Boca Chica": 3, "San Antonio de Guerra": 3, "La Caleta": 3, "Santo Domingo Oeste": 4,
                      "Los Alcarrizos": 5, "Pedro Brand": 5, "Santo Domingo Norte": 6, "La Victoria": 6},
}
muni.setdefault("Santo Domingo", [])
muni["Santo Domingo"] += ["La Caleta", "La Victoria"]

skip = {("Distrito Nacional", "Santo Domingo"), ("Santo Domingo", "Santo Domingo Este"),
        ("Santiago", "Santiago de los Caballeros")}
for prov, ms in muni.items():
    for m in ms:
        if (prov, m) in skip:
            continue
        circ = C(muni_circ[prov][m]) if prov in muni_circ else U
        add(prov, m, circ)

# --- Distritos municipales de provincias divididas en circunscripciones ---
dms = {
    "Santiago": [("Palmar Arriba", 1), ("El Limón", 1), ("San Francisco de Jacagua", 1),
                 ("Hato del Yaque", 2), ("La Canela", 2), ("Santiago Oeste", 2), ("El Caimito", 2),
                 ("Juncalito", 2), ("El Rubio", 2), ("La Cuesta", 2), ("Las Placetas", 2),
                 ("Pedro García", 3), ("Canabacoa", 3), ("Guayabal", 3), ("Las Palomas", 3), ("Canca La Piedra", 3)],
    "Santo Domingo": [("Hato Viejo", 3), ("Andrés", 3), ("Palmarejo-Villa Linda", 5), ("Pantoja", 5),
                      ("La Cuaba", 5), ("La Guáyiga", 5)],
    "San Cristóbal": [("Hato Damas", 1), ("El Pueblecito", 2), ("La Cuchilla", 2), ("Medina", 2),
                      ("San José del Puerto", 2), ("Doña Ana", 2), ("El Carril", 3)],
    "La Vega": [("Río Verde Arriba", 1), ("El Ranchito", 1), ("Rincón", 1), ("Buena Vista", 2),
                ("Manabao", 2), ("Tireo", 2), ("La Sabina", 2)],
    "Puerto Plata": [("Maimón", 1), ("Yásica Arriba", 1), ("Cabarete", 1), ("Sabaneta de Yásica", 1),
                     ("Río Grande", 2), ("Belloso", 2), ("Estrecho", 2), ("La Isabela", 2), ("Navas", 2),
                     ("Estero Hondo", 2), ("La Jaiba", 2)],
}
for prov, items in dms.items():
    for s, c in items:
        add(prov, s, C(c))

# --- Santiago de los Caballeros (municipio dividido en las 3 circunscripciones) ---
stgo = {
    1: ["Centro de la Ciudad", "El Ensueño", "Mejoramiento Social", "Los Jazmines", "Cienfuegos", "Monte Rico",
        "La Unión", "Pueblo Nuevo", "Baracoa", "Los Pepines", "La Joya", "Nibaje", "Ensanche Libertad",
        "Los Salados", "Bella Vista", "Villa Olga", "Los Jardines Metropolitanos", "Cerros de Gurabo"],
    2: ["Rafey", "Hato Mayor (Santiago)", "Las Charcas (Santiago)", "Camboya", "La Herradura", "Ensanche Bermúdez",
        "Villa Progreso"],
    3: ["Pekín", "Gurabo", "Los Reyes", "Arroyo Hondo (Santiago)", "Villa Olímpica", "Hoya del Caimito",
        "La Otra Banda", "Los Cerros", "Ensanche Espaillat (Santiago)", "Licey (zona sur)"],
}
for c, ss in stgo.items():
    for s in ss:
        add("Santiago", s, C(c))

# --- Santo Domingo Este: sectores y barrios por circunscripción (Ayuntamiento SDE) ---
for c in ("1", "2", "3"):
    for s in sde[c]["sectores"]:
        add("Santo Domingo", s.replace(" De ", " de ").replace(" Del ", " del "), C(c))
    for b in sde[c]["barrios"]:
        add("Santo Domingo", b, C(c))

# --- Otros sectores populares de Santo Domingo ---
for s in ["Villa Mella", "Sabana Perdida", "Guaricano", "Los Guaricanos", "Ciudad Modelo", "Higüero",
          "Los Casabes", "Jacagua (SDN)", "Marañón", "Villa Mella Centro"]:
    add("Santo Domingo", s, C(6))
for s in ["Herrera", "Las Caobas", "Manoguayabo", "Buenos Aires de Herrera", "Engombe", "Bayona",
          "El Café de Herrera", "Hato Nuevo", "Los Alcarrizos Viejo (Herrera)", "Las Palmas de Herrera",
          "Enriquillo (Herrera)", "Libertador de Herrera", "Duarte (Herrera)"]:
    add("Santo Domingo", s, C(4))
for s in ["Pueblo Nuevo (Los Alcarrizos)", "Savica (Los Alcarrizos)", "Los Americanos", "Lechería",
          "Barrio Landia", "La Piña (Los Alcarrizos)"]:
    add("Santo Domingo", s, C(5))

# --- Distrito Nacional: 70 barrios ---
dn = {
    1: ["Honduras del Oeste", "Honduras del Norte", "Paseo de los Indios", "Los Cacicazgos", "Renacimiento",
        "Los Restauradores", "San Gerónimo", "Los Jardines", "Jardín Botánico", "Paraíso", "Julieta Morales",
        "Los Praditos", "Los Prados", "El Millón", "Mirador Norte", "Mirador Sur", "Buenos Aires (Mirador)",
        "Miramar", "Tropical Metaldom", "Jardines del Sur", "Atala", "Bella Vista", "Ensanche Quisqueya",
        "Piantini", "La Julia", "Nuestra Señora de la Paz", "General Antonio Duvergé", "30 de Mayo",
        "El Cacique", "Centro de los Héroes", "Mata Hambre", "Ciudad Universitaria", "La Esperilla",
        "Ensanche Naco", "Centro Olímpico", "Miraflores", "San Juan Bosco", "Gazcue", "Ciudad Nueva",
        "Ciudad Colonial", "San Carlos", "San Diego", "Evaristo Morales", "Serrallés", "La Castellana"],
    2: ["Altos de Arroyo Hondo", "Arroyo Manzano", "Cerros de Arroyo Hondo", "Cristo Rey", "Ensanche La Fe",
        "Jardín Zoológico", "La Agustina", "La Hondonada", "La Isabela", "Las Praderas", "Los Peralejos",
        "Los Ríos", "Nuevo Arroyo Hondo", "Palma Real", "Los Próceres", "Viejo Arroyo Hondo", "Arroyo Hondo"],
    3: ["Villa Juana", "Villa Consuelo", "Villa Francisca", "Mejoramiento Social", "María Auxiliadora",
        "Domingo Savio", "Ensanche Espaillat", "Ensanche Luperón", "Villas Agrícolas", "La Zurza",
        "Ensanche Capotillo", "Simón Bolívar", "24 de Abril", "Gualey", "La Ciénaga", "Los Guandules"],
}
for c, ss in dn.items():
    for s in ss:
        add("Distrito Nacional", s, C(c))

out = sorted(rows.values(), key=lambda r: (r["provincia"], r["sector"]))
json.dump(out, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(out), "sectores;", len({r["provincia"] for r in out}), "provincias")
