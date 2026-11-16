import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OsrmService } from './osrm.service';

// ============================================================
// OsrmModule — provee OsrmService al resto del dominio.
//
// Uso:
//   @Module({
//     imports: [OsrmModule],
//     ...
//   })
//
// OsrmService es un singleton a nivel app (providedIn: 'root'
// en Angular, acá equivalente a no declarar scope).
// ============================================================

@Module({
  imports: [ConfigModule],
  providers: [OsrmService],
  exports: [OsrmService],
})
export class OsrmModule {}
