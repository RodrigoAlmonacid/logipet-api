import { Injectable } from '@nestjs/common';
import pdfmake from 'pdfmake';
import * as path from 'path';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { readFileSync } from 'fs';

const FUENTES = {
  Roboto: {
    normal: path.resolve(
      'node_modules/roboto-font/fonts/Roboto/roboto-regular-webfont.ttf',
    ),
    bold: path.resolve(
      'node_modules/roboto-font/fonts/Roboto/roboto-bold-webfont.ttf',
    ),
    italics: path.resolve(
      'node_modules/roboto-font/fonts/Roboto/roboto-italic-webfont.ttf',
    ),
    bolditalics: path.resolve(
      'node_modules/roboto-font/fonts/Roboto/roboto-bolditalic-webfont.ttf',
    ),
  },
};

const LOGO_PATH = path.resolve('assets/favicon.png');

@Injectable()
export class PresupuestoPdfService {

  private readonly logo = `data:image/png;base64,${readFileSync(LOGO_PATH).toString('base64')}`;

  async generar(pedido: any): Promise<Buffer> {
    pdfmake.addFonts(FUENTES);

    const filas = pedido.lineas.map((l: any) => [
      l.nombre,
      l.cantidad,
      `$${l.precioVenta.toFixed(2)}`,
      l.descuentoPorcentaje ? `${l.descuentoPorcentaje}%` : '—',
      `$${l.importeIva.toFixed(2)}`,
      `$${l.importeFinal.toFixed(2)}`,
    ]);

    const docDefinition: TDocumentDefinitions = {
      content: [
        {
          columns: [
            { image: this.logo, width: 90 },
            {
              text: 'Presupuesto',
              style: 'titulo',
              alignment: 'right',
              margin: [0, 20, 0, 0],
            },
          ],
          margin: [0, 0, 0, 16],
        },
        {
          text: `Cliente: ${pedido.cliente.comercio} - Vendedor: ${pedido.empleado.nombre}`,
          margin: [0, 0, 0, 4],
        },
        {
          text: `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [
              ['Producto', 'Cant.', 'Precio', 'Desc.', 'IVA', 'Final'],
              ...filas,
            ],
          },
        },
        {
          text: `Total: $${pedido.totales.final.toFixed(2)}`,
          style: 'total',
          margin: [0, 12, 0, 0],
        },
        {
          text: 'Este documento es un presupuesto, no un comprobante fiscal.',
          style: 'nota',
          margin: [0, 20, 0, 0],
        },
      ],
      styles: {
        titulo: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
        total: { fontSize: 14, bold: true, alignment: 'right' },
        nota: { fontSize: 8, italics: true, color: 'gray' },
      },
      defaultStyle: { font: 'Roboto' },
    };

    const pdf = pdfmake.createPdf(docDefinition);

    return pdf.getBuffer();
  }
}