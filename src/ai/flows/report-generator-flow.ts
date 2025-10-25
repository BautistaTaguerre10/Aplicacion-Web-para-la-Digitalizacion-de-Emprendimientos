
'use server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  GenerateReportInputSchema,
  type GenerateReportInput,
  type GenerateReportOutput,
} from './types';

const MODEL_ID = 'gemini-2.0-flash'; // o 'gemini-1.5-flash'

export async function generateReport(input: GenerateReportInput): Promise<GenerateReportOutput> {
  const parsed = GenerateReportInputSchema.parse(input);

  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error('Falta GOOGLE_GENAI_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_ID });

  const guard = `
Eres un generador de JSON estricto.
Devuelve SOLO: {"reportContent":"<markdown aquí>"} (sin texto extra, sin backticks)
que las respuesta se vena como en este ejpmlo:Reporte de Precios y Márgenes
Este reporte analiza los precios y márgenes de los productos en el catálogo.

Rango de Precios
Producto Más Caro: iphone 16 pro ($2,000,000)
Producto Más Barato: mouse logit ($35,000)
Margen Promedio
El margen promedio se calcula como ((Precio - Costo) / Precio) * 100.

mouse logit: Margen = (($35,000 - $10,000) / $35,000) * 100 = 71.43%
ipods q3: Margen = (($25,000 - $10,000) / $25,000) * 100 = 60%
iphone 16 pro: Margen = (($2,000,000 - $1,000) / $2,000,000) * 100 = 99.95%
Margen Promedio General: (71.43% + 60% + 99.95%) / 3 = 77.13%

Ítems con Margen <= 15% o Negativo
No hay ítems con margen menor o igual al 15% o negativo.

Advertencias y Sugerencias
Precio del iPhone: El precio del iPhone 16 pro es significativamente alto en comparación con su costo. Si bien el margen es excelente, es crucial analizar si este precio es competitivo en el mercado y si las ventas justifican el precio alto. Considere si el precio es un error de tipeo.
Stock Uniforme: Todos los productos tienen un stock de 10. Revise la gestión de inventario para optimizar los niveles de stock en función de la demanda real de cada producto. Evitar sobrestock de productos de baja rotación, e insuficiencia de stock para los de alta rotación.
Análisis de Competencia: Realizar un análisis de la competencia es crucial para asegurar que los precios sean competitivos y que los márgenes sean sostenibles. Ajuste los precios en función de la competencia para maximizar las ventas y los beneficios.
 
`.trim();

  const prompt = buildPrompt(parsed);
  const res = await model.generateContent([guard, prompt]);
  const raw = res.response.text() || '';

  const content = extractReportContent(raw) ?? raw; // si no viene JSON válido, usa el texto

  return {
    title: titleFor(parsed.reportType),
    content, // <-- string Markdown listo para renderizar
  };
}

function titleFor(t: GenerateReportInput['reportType']) {
  if (t === 'catalog') return 'Reporte de Análisis de Catálogo';
  if (t === 'stock') return 'Reporte de Análisis de Stock';
  return 'Reporte de Precios y Márgenes';
}

function buildPrompt(input: GenerateReportInput) {
  const products = input.products.map(p =>
    `- Nombre: ${p.name}, Precio: $${p.price}, Costo: $${p.cost}, Stock: ${p.stock}, Visible: ${p.visible ? 'Sí' : 'No'}`
  ).join('\n');

  if (input.reportType === 'catalog') {
    return `
Genera un reporte de catálogo. Usa Markdown en "reportContent".
Secciones: Resumen, Precio promedio, Margen promedio, Stock total/promedio, 2-3 conclusiones.
Productos:
${products}
`.trim();
  }
  if (input.reportType === 'stock') {
    return `
Genera un reporte de stock. Usa Markdown en "reportContent".
Secciones: Sin stock, Top 3-5 por stock, Valor de inventario (stock*costo), 2-3 recomendaciones.
Productos:
${products}
`.trim();
  }
  return `
Genera un reporte de precios y márgenes. Usa Markdown en "reportContent".
Secciones: Rango de precios (más caro/barato), Margen promedio, Ítems con margen <=15% o negativo, 2-3 advertencias/sugerencias.
Productos:
${products}
`.trim();
}

function extractReportContent(raw: string): string | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.reportContent === 'string') return obj.reportContent;
  } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj && typeof obj.reportContent === 'string') return obj.reportContent;
    } catch {}
  }
  return null;
}
