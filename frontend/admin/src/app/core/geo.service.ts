import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

export interface GeoCity {
  id: number;
  regionId: number;
  nameAr: string;
  nameEn: string;
  districtCount: number;
}

export interface GeoDistrict {
  id: number;
  nameAr: string;
  nameEn: string;
}

export interface GeoRegion {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
}

/** Saudi regions / cities / districts lookup. Loaded once per session and cached (also cached by the browser). */
@Injectable({ providedIn: 'root' })
export class GeoService {
  private readonly http = inject(HttpClient);
  private cities$?: Observable<GeoCity[]>;
  private regions$?: Observable<GeoRegion[]>;
  private readonly districts$ = new Map<number, Observable<GeoDistrict[]>>();

  cities(): Observable<GeoCity[]> {
    return (this.cities$ ??= this.http.get<GeoCity[]>('/api/v1/geo/cities').pipe(shareReplay(1)));
  }

  regions(): Observable<GeoRegion[]> {
    return (this.regions$ ??= this.http.get<GeoRegion[]>('/api/v1/geo/regions').pipe(shareReplay(1)));
  }

  districts(cityId: number): Observable<GeoDistrict[]> {
    let d = this.districts$.get(cityId);
    if (!d) {
      d = this.http.get<GeoDistrict[]>(`/api/v1/geo/cities/${cityId}/districts`).pipe(shareReplay(1));
      this.districts$.set(cityId, d);
    }
    return d;
  }
}
