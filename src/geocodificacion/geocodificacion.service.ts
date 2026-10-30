import { BadRequestException, Injectable } from '@nestjs/common';

export interface ResultadoGeocodificacion {
  display_name: string;
  lat: string;
  lon: string;
}

@Injectable()
export class GeocodificacionService {
  async buscar(q: string): Promise<ResultadoGeocodificacion[]> {
    if (!q?.trim()) throw new BadRequestException('Falta el parámetro de búsqueda');

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', q);
    url.searchParams.set('countrycodes', 'ar');
    url.searchParams.set('limit', '5');

    console.log('BACKEND Consulta externa:', url.toString()); // mensajes para mostrar salidas en Framework e interoperabilidad
    const respuesta = await fetch(url, {
      headers: {
        // Nominatim exige identificarse: https://operations.osmfoundation.org/policies/nominatim/
        'User-Agent': 'Logipet/1.0 (contacto@logipet.com)',
      },
    });

    if (!respuesta.ok) {
      throw new BadRequestException('No se pudo consultar el servicio de geocodificación');
    }

    return respuesta.json();
  }

  async inversa(lat: string, lon: string): Promise<ResultadoGeocodificacion> {
    if (!lat || !lon) throw new BadRequestException('Faltan latitud o longitud');

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'json');
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lon);

    console.log('BACKEND Consulta externa:', url.toString());  // mensajes para mostrar salidas en Framework e interoperabilidad
    const respuesta = await fetch(url, {
      headers: { 'User-Agent': 'Logipet/1.0 (contacto@logipet.com)' },
    });

    if (!respuesta.ok) {
      throw new BadRequestException('No se pudo consultar la dirección inversa');
    }

    return respuesta.json();
  }
}