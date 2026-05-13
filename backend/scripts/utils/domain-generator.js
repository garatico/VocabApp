/**
 * domain-generator.js
 * Assigns semantic domains to Spanish vocabulary words
 */

const domainMappings = {
  'empresa': 'Business', 'dinero': 'Business', 'precio': 'Business', 'vender': 'Business',
  'comprar': 'Business', 'producto': 'Business', 'mercado': 'Business', 'cliente': 'Business',
  'negocio': 'Business', 'banco': 'Business', 'salario': 'Business', 'presupuesto': 'Business',
  'inversión': 'Business', 'venta': 'Business', 'comercio': 'Business', 'industria': 'Business',
  'fábrica': 'Business', 'ganancia': 'Business', 'factura': 'Business', 'pago': 'Business',
  'deuda': 'Business', 'préstamo': 'Business', 'interés': 'Business', 'empleado': 'Business',
  'jefe': 'Business', 'oficina': 'Business', 'reunión': 'Business', 'contrato': 'Business',

  'escuela': 'Academic', 'estudiante': 'Academic', 'profesor': 'Academic', 'libro': 'Academic',
  'aprender': 'Academic', 'enseñar': 'Academic', 'clase': 'Academic', 'educación': 'Academic',
  'universidad': 'Academic', 'examen': 'Academic', 'calificación': 'Academic', 'escritura': 'Academic',
  'lectura': 'Academic', 'matemáticas': 'Academic', 'ciencia': 'Academic', 'investigación': 'Academic',
  'alumno': 'Academic', 'biblioteca': 'Academic', 'estudio': 'Academic', 'curso': 'Academic',

  'médico': 'Medical', 'hospital': 'Medical', 'enfermedad': 'Medical', 'dolor': 'Medical',
  'medicina': 'Medical', 'paciente': 'Medical', 'doctor': 'Medical', 'salud': 'Medical',
  'enfermero': 'Medical', 'síntoma': 'Medical', 'tratamiento': 'Medical', 'cirugía': 'Medical',
  'virus': 'Medical', 'infección': 'Medical', 'antibiótico': 'Medical', 'farmacia': 'Medical',
  'medicamento': 'Medical', 'receta': 'Medical', 'sangre': 'Medical', 'corazón': 'Medical',
  'pulmón': 'Medical', 'cerebro': 'Medical', 'fiebre': 'Medical', 'gripe': 'Medical',
  'alergia': 'Medical', 'asma': 'Medical', 'diabetes': 'Medical', 'clínica': 'Medical',

  'computadora': 'Technology', 'software': 'Technology', 'internet': 'Technology', 'teléfono': 'Technology',
  'aplicación': 'Technology', 'código': 'Technology', 'programa': 'Technology', 'ordenador': 'Technology',
  'digital': 'Technology', 'red': 'Technology', 'servidor': 'Technology', 'datos': 'Technology',
  'algoritmo': 'Technology', 'contraseña': 'Technology', 'pantalla': 'Technology', 'teclado': 'Technology',
  'ratón': 'Technology', 'monitor': 'Technology', 'procesador': 'Technology', 'memoria': 'Technology',
  'móvil': 'Technology', 'tableta': 'Technology', 'wifi': 'Technology',

  'comida': 'Food', 'cocina': 'Food', 'restaurante': 'Food', 'cocinero': 'Food',
  'ingrediente': 'Food', 'plato': 'Food', 'sabor': 'Food', 'pan': 'Food',
  'carne': 'Food', 'verdura': 'Food', 'fruta': 'Food', 'pescado': 'Food',
  'bebida': 'Food', 'vino': 'Food', 'café': 'Food', 'arroz': 'Food',
  'patata': 'Food', 'tomate': 'Food', 'cebolla': 'Food', 'ajo': 'Food',
  'leche': 'Food', 'queso': 'Food', 'huevo': 'Food', 'pollo': 'Food',
  'postre': 'Food', 'almuerzo': 'Food', 'cena': 'Food', 'desayuno': 'Food',

  'deporte': 'Sports', 'futbol': 'Sports', 'tenis': 'Sports', 'jugador': 'Sports',
  'equipo': 'Sports', 'entrenador': 'Sports', 'correr': 'Sports', 'atleta': 'Sports',
  'competencia': 'Sports', 'victoria': 'Sports', 'derrota': 'Sports', 'entrenamiento': 'Sports',
  'ejercicio': 'Sports', 'gimnasio': 'Sports', 'baloncesto': 'Sports', 'voleibol': 'Sports',
  'natación': 'Sports', 'boxeo': 'Sports', 'gol': 'Sports', 'punto': 'Sports',

  'arte': 'Arts', 'música': 'Arts', 'pintura': 'Arts', 'escultura': 'Arts',
  'artista': 'Arts', 'teatro': 'Arts', 'cine': 'Arts', 'película': 'Arts',
  'canción': 'Arts', 'instrumento': 'Arts', 'danza': 'Arts', 'ballet': 'Arts',
  'ópera': 'Arts', 'museo': 'Arts', 'galería': 'Arts', 'concierto': 'Arts',
  'guitarra': 'Arts', 'piano': 'Arts', 'violín': 'Arts',

  'viaje': 'Travel', 'país': 'Travel', 'ciudad': 'Travel', 'montaña': 'Travel',
  'playa': 'Travel', 'hotel': 'Travel', 'avión': 'Travel', 'turista': 'Travel',
  'turismo': 'Travel', 'destino': 'Travel', 'mapa': 'Travel', 'pasaporte': 'Travel',
  'equipaje': 'Travel', 'maleta': 'Travel', 'vuelo': 'Travel', 'estación': 'Travel',
  'camino': 'Travel', 'isla': 'Travel', 'región': 'Travel',

  'naturaleza': 'Environment', 'árbol': 'Environment', 'flor': 'Environment', 'agua': 'Environment',
  'aire': 'Environment', 'tierra': 'Environment', 'animal': 'Environment', 'pájaro': 'Environment',
  'insecto': 'Environment', 'bosque': 'Environment', 'río': 'Environment', 'océano': 'Environment',
  'clima': 'Environment', 'contaminación': 'Environment', 'sol': 'Environment', 'luna': 'Environment',
  'estrella': 'Environment', 'nube': 'Environment', 'lluvia': 'Environment', 'nieve': 'Environment',
  'viento': 'Environment', 'planta': 'Environment', 'hierba': 'Environment', 'hoja': 'Environment',

  'ley': 'Legal', 'abogado': 'Legal', 'juez': 'Legal', 'corte': 'Legal',
  'delito': 'Legal', 'crimen': 'Legal', 'policía': 'Legal', 'justicia': 'Legal',
  'acusación': 'Legal', 'defensa': 'Legal', 'sentencia': 'Legal', 'tribunal': 'Legal'
};

function assignDomain(word) {
  const normalized = (word || '').toLowerCase().trim();
  return domainMappings[normalized] || 'General';
}

function enrichWordWithDomain(word) {
  const enriched = { ...word };
  // Always assign domain based on mapping (allows updates on re-enrichment)
  const domain = assignDomain(word.word);
  enriched.domains = [domain];
  return enriched;
}

function enrichWordsWithDomains(words) {
  return words.map(word => enrichWordWithDomain(word));
}

export { assignDomain, enrichWordWithDomain, enrichWordsWithDomains, domainMappings };
