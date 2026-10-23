import{E as O,a as _}from"./vendor-pdf-Ck84ZGEw.js";import{E as U}from"./vendor-excel-DIsiPRo8.js";const L=[{id:"flute_e_1_5",name:"E-Flute (1.5mm Micro-corrugated)",kind:"cardboard",thicknessMm:1.5,densityKgM3:300,grammageGsm:450,costMxnPerM2:32,description:"Lightweight presentation & mailers (up to 4 kg)"},{id:"flute_b_3",name:"B-Flute (3.0mm Single-Wall)",kind:"cardboard",thicknessMm:3,densityKgM3:183,grammageGsm:550,costMxnPerM2:42,description:"Standard medium shipping carton (up to 15 kg)"},{id:"flute_c_4",name:"C-Flute (4.0mm Single-Wall)",kind:"cardboard",thicknessMm:4,densityKgM3:162,grammageGsm:650,costMxnPerM2:50,description:"Heavy single-wall box with compression strength (up to 25 kg)"},{id:"flute_bc_7",name:"BC-Flute (7.0mm Double-Wall)",kind:"cardboard",thicknessMm:7,densityKgM3:157,grammageGsm:1100,costMxnPerM2:78,description:"Heavy duty double-wall for stone lamps, mirrors & panels (up to 50 kg)"}],E=[{id:"ply_9_ht_pine",name:"9mm Radiata Pine Plywood (ISPM-15 Exempt)",kind:"plywood",thicknessMm:9,densityKgM3:580,costMxnPerM2:175,description:"Light crate sheathing for small to medium sculptures"},{id:"ply_12_ht_pine",name:"12mm CDX Pine Plywood (ISPM-15 Exempt)",kind:"plywood",thicknessMm:12,densityKgM3:600,costMxnPerM2:230,description:"Standard export crate walls & lid for stone decor"},{id:"ply_18_ht_pine",name:"18mm Structural Pine Plywood (ISPM-15 Exempt)",kind:"plywood",thicknessMm:18,densityKgM3:620,costMxnPerM2:340,description:"Heavy crate base floor and heavy sculpture enclosures"}],S={skidRunner:{densityKgM3:520,costMxnPerMeter:68},cleat:{densityKgM3:520,costMxnPerMeter:38},foamPE:{densityKgM3:35,costMxnPerM3:3800}},T={gma:{widthCm:101.6,lengthCm:121.9,heightCm:14,tareKg:18.5,costMxn:320},eur:{widthCm:80,lengthCm:120,heightCm:14.4,tareKg:24.5,costMxn:450}};function z(t){const r=t.kind||"cardboard",o=t.dimBasis||"inside",e=t.foamPaddingMm??(r==="cardboard"?15:r==="crate"?25:0);let n=t.boardThicknessMm;n||(r==="cardboard"?n=7:r==="crate"?n=12:n=20);const c=t.cleatMm?.thick??19,x=t.skidMm?.height??(r==="crate"?89:140),g=r==="crate"?18:0,d=r==="crate"?n:0;let i=t.innerCm?.w??40,l=t.innerCm?.l??40,f=t.innerCm?.h??40,m=t.outerCm?.w??45,a=t.outerCm?.l??45,y=t.outerCm?.h??50;if(r==="cardboard"){const h=2*(e+n)/10,b=2*(e+n)/10,M=(2*e+4*n)/10;o==="inside"?(m=Number((i+h).toFixed(1)),a=Number((l+b).toFixed(1)),y=Number((f+M).toFixed(1))):(i=Math.max(5,Number((m-h).toFixed(1))),l=Math.max(5,Number((a-b).toFixed(1))),f=Math.max(5,Number((y-M).toFixed(1))))}else if(r==="crate"){const h=n+c+e,b=2*h/10,M=2*h/10,s=(x+g+d+c+2*e)/10;o==="inside"?(m=Number((i+b).toFixed(1)),a=Number((l+M).toFixed(1)),y=Number((f+s).toFixed(1))):(i=Math.max(10,Number((m-b).toFixed(1))),l=Math.max(10,Number((a-M).toFixed(1))),f=Math.max(10,Number((y-s).toFixed(1))))}else if(t.style==="pallet_gma")m=T.gma.widthCm,a=T.gma.lengthCm,y=T.gma.heightCm,i=m,l=a,f=Math.max(10,y);else if(t.style==="pallet_eur")m=T.eur.widthCm,a=T.eur.lengthCm,y=T.eur.heightCm,i=m,l=a,f=Math.max(10,y);else{const h=t.deckboards?.thickMm??20;y=((t.skidMm?.height??89)+2*h)/10,o==="inside"?(m=i,a=l):(i=m,l=a)}return{innerCm:{w:i,l,h:f},outerCm:{w:m,l:a,h:y},boardThicknessMm:n,foamPaddingMm:e}}function N(t){const{innerCm:r,outerCm:o,kind:e,boardThicknessMm:n,foamPaddingMm:c}=t,x=Number((r.w*r.l*r.h/1e3).toFixed(2)),g=Number((o.w*o.l*o.h/1e6).toFixed(3));let d=0,i=0;if(e==="cardboard"){const f=n,m=(2*(r.l*10+r.w*10)+35+4*f)/1e3,a=(r.h*10+r.w*10+2*f)/1e3,y=m*a,h=L.find(w=>w.id===t.materialId)||L[3],b=y*((h.grammageGsm||1100)/1e3),s=2*(r.w*r.l+r.w*r.h+r.l*r.h)/1e4*(c/1e3),k=s*S.foamPE.densityKgM3;d=Number((b+k).toFixed(1)),i=Math.round(y*h.costMxnPerM2+s*S.foamPE.costMxnPerM3+25)}else if(e==="crate"){const l=o.w*10/1e3,f=o.l*10/1e3,m=o.h*10/1e3,a=l*f,y=l*f,h=2*(f*m),b=2*(l*m),M=a+y+h+b,s=E.find(D=>D.id===t.materialId)||E[1],k=M*(t.boardThicknessMm/1e3)*s.densityKgM3,u=(t.skidMm?.count??3)*f,p=u*.089*.089*S.skidRunner.densityKgM3,C=2*(f*2+m*2)+2*(l*2+m*2),P=2*(l+f),H=4*Math.sqrt(l*l+m*m),A=C+P+H,B=A*.019*.089*S.cleat.densityKgM3,I=r.w*10/1e3,W=r.l*10/1e3,R=r.h*10/1e3,v=2*(I*W+I*R+W*R)*(c/1e3),K=v*S.foamPE.densityKgM3;d=Number((k+p+B+K+2.5).toFixed(1)),i=Math.round(M*s.costMxnPerM2+u*S.skidRunner.costMxnPerMeter+A*S.cleat.costMxnPerMeter+v*S.foamPE.costMxnPerM3+150)}else if(t.style==="pallet_gma")d=T.gma.tareKg,i=T.gma.costMxn;else if(t.style==="pallet_eur")d=T.eur.tareKg,i=T.eur.costMxn;else{const l=t.skidMm?.count??3,f=o.l*10/1e3,m=l*f,a=(t.deckboards?.countTop??7)+(t.deckboards?.countBottom??5),y=o.w*10/1e3,h=a*y,b=m*.089*.089+h*.02*.089;d=Number((b*520).toFixed(1)),i=Math.round(m*S.skidRunner.costMxnPerMeter+h*35+80)}return{innerVolumeLiters:x,outerVolumeCbm:g,tareWeightKg:Math.max(1,d),estimatedCostMxn:Math.max(50,i)}}function j(t){const{kind:r,innerCm:o,outerCm:e,boardThicknessMm:n,foamPaddingMm:c}=t,x=[];let g=0,d=0,i=0,l=0;if(r==="cardboard"){const a=n,y=o.l*10+2*c,h=o.w*10+2*c,b=o.h*10+2*c,M=2*(y+h)+35+4*a,s=b+h+2*a,k=M*s/1e6;i+=k;const w=L.find(F=>F.id===t.materialId)||L[3];if(x.push({part:"FEFCO 0201 Corrugated Blank",qty:1,material:w.name,dimsMm:`${Math.round(M)} × ${Math.round(s)} × ${a} mm`,purpose:"Single-piece die-cut carton blank with glue flap & slotted flaps",areaM2:Number(k.toFixed(3))}),c>0){const F=2*(o.w*10*o.l*10)/1e6,u=2*(o.l*10*o.h*10)/1e6,$=2*(o.w*10*o.h*10)/1e6;l=(F+u+$)*(c/1e3),x.push({part:"Foam Top & Bottom Pads",qty:2,material:`PE Foam ${c}mm`,dimsMm:`${Math.round(o.w*10)} × ${Math.round(o.l*10)} × ${c} mm`,purpose:"Drop cushioning top & bottom impact absorbing plates"}),x.push({part:"Foam Side Panels",qty:2,material:`PE Foam ${c}mm`,dimsMm:`${Math.round(o.l*10)} × ${Math.round(o.h*10)} × ${c} mm`,purpose:"Long side face perimeter wall cushioning"}),x.push({part:"Foam End Panels",qty:2,material:`PE Foam ${c}mm`,dimsMm:`${Math.round(o.w*10)} × ${Math.round(o.h*10)} × ${c} mm`,purpose:"End face perimeter wall cushioning"})}t.laserDividersEnabled&&x.push({part:"Boxes.py Internal Laser Grid",qty:1,material:"3mm Baltic Birch / MDF",dimsMm:`${Math.round(o.w*10-20)} × ${Math.round(o.l*10-20)} × ${Math.round(o.h*10-20)} mm`,purpose:"Interlocking slotted separator grid for fragile items"})}else if(r==="crate"){const m=Math.round(e.w*10),a=Math.round(e.l*10),y=Math.round(e.h*10),h=E.find(P=>P.id===t.materialId)||E[1],b=m*a/1e6;g+=b,x.push({part:"Crate Floor Panel",qty:1,material:"18mm Radiata Pine Plywood (ISPM-15 Exempt)",dimsMm:`${m} × ${a} × 18 mm`,purpose:"Structural heavy-load floor bed fastened to skid runners",areaM2:Number(b.toFixed(3))});const M=m*a/1e6;g+=M,x.push({part:"Crate Top Lid Panel",qty:1,material:h.name,dimsMm:`${m} × ${a} × ${t.boardThicknessMm} mm`,purpose:"Removable top sheathing panel with screw fastening",areaM2:Number(M.toFixed(3))});const s=y-(t.skidMm?.height??89)-18-t.boardThicknessMm-(t.cleatMm?.thick??19),k=2*(a*s)/1e6;g+=k,x.push({part:"Long Side Panels",qty:2,material:h.name,dimsMm:`${a} × ${s} × ${t.boardThicknessMm} mm`,purpose:"Main longitudinal cleated wall sheathing",areaM2:Number(k.toFixed(3))});const w=m-2*t.boardThicknessMm,F=2*(w*s)/1e6;g+=F,x.push({part:"End Panels",qty:2,material:h.name,dimsMm:`${w} × ${s} × ${t.boardThicknessMm} mm`,purpose:"Transverse wall sheathing panels",areaM2:Number(F.toFixed(3))});const u=t.skidMm?.count??3,$=a/1e3,p=u*$;d+=p,x.push({part:"Skid Runners (Forklift Chamfered)",qty:u,material:'Solid Pine 4×4" HT (MX-HT-ISPM15)',dimsMm:`89 × 89 × ${a} mm`,purpose:"Longitudinal base runners with 45° chamfers for pallet jack entry"});const C=(4*a+4*m+8*s)/1e3;d+=C,x.push({part:"Perimeter Wall & Lid Cleats",qty:12,material:'Solid Pine 1×4" HT (MX-HT-ISPM15)',dimsMm:`19 × 89 × Var mm (Total: ${C.toFixed(1)}m)`,purpose:"External perimeter structural framing to stiffen plywood sheets"}),c>0&&(l=2*(o.w*10*o.l*10+o.l*10*o.h*10+o.w*10*o.h*10)/1e6*(c/1e3),x.push({part:"Interior Foam Cushioning Lining",qty:6,material:`Closed-Cell PE Foam ${c}mm`,dimsMm:`Fitted to internal cavity × ${c} mm`,purpose:"Non-abrasive stone shock and vibration dampening envelope"}))}else{const m=t.style==="pallet_gma",a=t.skidMm?.count??3,y=t.deckboards?.countTop??(m?7:5),h=t.deckboards?.countBottom??(m?5:3),b=Math.round(e.l*10),M=Math.round(e.w*10);d=(a*b+(y+h)*M)/1e3,x.push({part:"Pallet Stringers / Runners",qty:a,material:"Solid Pine HT Lumber (MX-HT-ISPM15)",dimsMm:`38 × 89 × ${b} mm`,purpose:"Four-way notched stringer runners for forklift tine entry"}),x.push({part:"Top Deckboards",qty:y,material:"Solid Pine HT Board (MX-HT-ISPM15)",dimsMm:`20 × 95 × ${M} mm`,purpose:"Cargo supporting top surface with balanced deck gaps"}),x.push({part:"Bottom Deckboards",qty:h,material:"Solid Pine HT Board (MX-HT-ISPM15)",dimsMm:`20 × 95 × ${M} mm`,purpose:"Ground bearing bottom skid boards for conveyor & stacking"})}const f=N(t);return{items:x,totalPlywoodM2:Number(g.toFixed(2)),totalLumberM:Number(d.toFixed(1)),totalCardboardM2:Number(i.toFixed(2)),totalFoamM3:Number(l.toFixed(3)),tareWeightKg:f.tareWeightKg,estimatedCostMxn:f.estimatedCostMxn}}function J(t){const{kind:r,innerCm:o,outerCm:e,boardThicknessMm:n}=t;if(r==="cardboard"){const x=n,g=Math.round(o.l*10+2*t.foamPaddingMm),d=Math.round(o.w*10+2*t.foamPaddingMm),i=Math.round(o.h*10+2*t.foamPaddingMm),l=Math.round(d/2),f=35+2*g+2*d,m=i+2*l,a=60,y=f+a*2,h=m+a*2,b=a,M=a,s=a+l,k=s+i,w=k+l,F=b,u=F+35,$=u+g,p=$+d,C=p+g,P=C+d;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${y} ${h}" width="100%" height="100%" style="background:#090b0e; font-family: ui-monospace, monospace;">
      <defs>
        <pattern id="glue-hatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#7FBBFF" stroke-width="1.5" opacity="0.6" />
        </pattern>
      </defs>

      <!-- Grid lines -->
      <line x1="${a}" y1="${h-20}" x2="${y-a}" y2="${h-20}" stroke="#ffffff" stroke-opacity="0.15" stroke-dasharray="4,4" />

      <!-- Glue Flap -->
      <polygon points="${F},${s+15} ${u},${s} ${u},${k} ${F},${k-15}" fill="url(#glue-hatch)" stroke="#7FBBFF" stroke-width="1.5" />
      <text x="${F+10}" y="${s+i/2}" fill="#7FBBFF" font-size="11" font-weight="bold" transform="rotate(-90 ${F+10} ${s+i/2})" text-anchor="middle">GLUE FLAP (35mm)</text>

      <!-- Main Panels Outline (Solid Cuts) -->
      <!-- Top flap cuts -->
      <line x1="${u}" y1="${M}" x2="${P}" y2="${M}" stroke="#ffffff" stroke-width="2" />
      <line x1="${u}" y1="${M}" x2="${u}" y2="${s}" stroke="#ffffff" stroke-width="2" />
      <line x1="${$}" y1="${M}" x2="${$}" y2="${s}" stroke="#ffffff" stroke-width="2" />
      <line x1="${p}" y1="${M}" x2="${p}" y2="${s}" stroke="#ffffff" stroke-width="2" />
      <line x1="${C}" y1="${M}" x2="${C}" y2="${s}" stroke="#ffffff" stroke-width="2" />
      <line x1="${P}" y1="${M}" x2="${P}" y2="${s}" stroke="#ffffff" stroke-width="2" />

      <!-- Bottom flap cuts -->
      <line x1="${u}" y1="${w}" x2="${P}" y2="${w}" stroke="#ffffff" stroke-width="2" />
      <line x1="${u}" y1="${k}" x2="${u}" y2="${w}" stroke="#ffffff" stroke-width="2" />
      <line x1="${$}" y1="${k}" x2="${$}" y2="${w}" stroke="#ffffff" stroke-width="2" />
      <line x1="${p}" y1="${k}" x2="${p}" y2="${w}" stroke="#ffffff" stroke-width="2" />
      <line x1="${C}" y1="${k}" x2="${C}" y2="${w}" stroke="#ffffff" stroke-width="2" />
      <line x1="${P}" y1="${k}" x2="${P}" y2="${w}" stroke="#ffffff" stroke-width="2" />

      <!-- Outer perimeter right side -->
      <line x1="${P}" y1="${s}" x2="${P}" y2="${k}" stroke="#ffffff" stroke-width="2" />

      <!-- Score / Crease lines (Dashed Cyan) -->
      <!-- Horizontal crease: top flaps -->
      <line x1="${u}" y1="${s}" x2="${P}" y2="${s}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <!-- Horizontal crease: bottom flaps -->
      <line x1="${u}" y1="${k}" x2="${P}" y2="${k}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <!-- Vertical crease folds between body panels -->
      <line x1="${u}" y1="${s}" x2="${u}" y2="${k}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <line x1="${$}" y1="${s}" x2="${$}" y2="${k}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <line x1="${p}" y1="${s}" x2="${p}" y2="${k}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <line x1="${C}" y1="${s}" x2="${C}" y2="${k}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />

      <!-- Body Panel Labels -->
      <rect x="${u+10}" y="${s+10}" width="${g-20}" height="${i-20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${u+g/2}" y="${s+i/2-8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">FRONT (L)</text>
      <text x="${u+g/2}" y="${s+i/2+12}" fill="#38bdf8" font-size="11" text-anchor="middle">${o.l} cm</text>

      <rect x="${$+10}" y="${s+10}" width="${d-20}" height="${i-20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${$+d/2}" y="${s+i/2-8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">SIDE (W)</text>
      <text x="${$+d/2}" y="${s+i/2+12}" fill="#38bdf8" font-size="11" text-anchor="middle">${o.w} cm</text>

      <rect x="${p+10}" y="${s+10}" width="${g-20}" height="${i-20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${p+g/2}" y="${s+i/2-8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">BACK (L)</text>
      <text x="${p+g/2}" y="${s+i/2+12}" fill="#38bdf8" font-size="11" text-anchor="middle">${o.l} cm</text>

      <rect x="${C+10}" y="${s+10}" width="${d-20}" height="${i-20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${C+d/2}" y="${s+i/2-8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">SIDE (W)</text>
      <text x="${C+d/2}" y="${s+i/2+12}" fill="#38bdf8" font-size="11" text-anchor="middle">${o.w} cm</text>

      <!-- Flap Labels -->
      <text x="${u+g/2}" y="${M+l/2}" fill="#ffffff" fill-opacity="0.4" font-size="10" text-anchor="middle">Top Flap (${(o.w/2).toFixed(1)}cm)</text>
      <text x="${u+g/2}" y="${w-l/2}" fill="#ffffff" fill-opacity="0.4" font-size="10" text-anchor="middle">Bottom Flap (${(o.w/2).toFixed(1)}cm)</text>

      <!-- Dimension Callouts -->
      <text x="${a}" y="${a-22}" fill="#94a3b8" font-size="12" font-weight="bold">FEFCO 0201 RSC DIE-CUT BLANK — BLANK: ${f} × ${m} mm (t = ${x}mm)</text>
      <text x="${a}" y="${a-8}" fill="#64748b" font-size="10">Solid White: Outer Cut / Slit Line · Dashed Cyan: Score / Bend Crease Line</text>
    </svg>`}else{if(r==="crate")return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 540" width="100%" height="100%" style="background:#090b0e; font-family: ui-monospace, monospace;">
      <defs>
        <pattern id="wood-hatch" width="12" height="12" patternTransform="rotate(25 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#d97706" stroke-width="0.8" opacity="0.3" />
        </pattern>
      </defs>

      <!-- Title & ISPM-15 Mark -->
      <text x="40" y="32" fill="#f59e0b" font-size="14" font-weight="bold">ISPM-15 CLEATED PLYWOOD CRATE PANEL FABRICATION LAYOUT</text>
      <text x="40" y="48" fill="#78716c" font-size="10">External: ${e.w} × ${e.l} × ${e.h} cm · Usable Inner: ${o.w} × ${o.l} × ${o.h} cm</text>

      <!-- Official IPPC Wheat Mark Vector Stamp -->
      <g transform="translate(680, 16)">
        <rect x="0" y="0" width="170" height="64" rx="4" fill="#1c1917" stroke="#f59e0b" stroke-width="1.8" />
        <line x1="50" y1="0" x2="50" y2="64" stroke="#f59e0b" stroke-width="1.8" />
        <!-- IPPC symbol -->
        <text x="25" y="24" fill="#f59e0b" font-size="10" font-weight="bold" text-anchor="middle">IPPC</text>
        <path d="M 25 30 L 25 56 M 20 38 L 25 32 L 30 38 M 20 48 L 25 42 L 30 48" stroke="#f59e0b" stroke-width="1.5" fill="none" />
        <!-- HT MX registration mark -->
        <text x="60" y="24" fill="#f59e0b" font-size="11" font-weight="bold">MX - 042</text>
        <text x="60" y="44" fill="#f59e0b" font-size="11" font-weight="bold">HT</text>
        <text x="60" y="56" fill="#78716c" font-size="8">ISPM-15 COMPLIANT</text>
      </g>

      <!-- Panel 1: Floor Bed (18mm) -->
      <g transform="translate(40, 90)">
        <rect x="0" y="0" width="240" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="240" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <!-- Skid runner positions underneath (dashed) -->
        <line x1="20" y1="0" x2="20" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="120" y1="0" x2="120" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="220" y1="0" x2="220" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <text x="120" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">1. CRATE FLOOR PANEL</text>
        <text x="120" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">18mm Plywood + 3× Skids (89×89mm)</text>
        <text x="120" y="114" fill="#78716c" font-size="9" text-anchor="middle">${e.w} × ${e.l} cm</text>
      </g>

      <!-- Panel 2: Top Lid (12mm) -->
      <g transform="translate(310, 90)">
        <rect x="0" y="0" width="240" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="240" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <!-- Cleats perimeter -->
        <rect x="8" y="8" width="224" height="154" fill="none" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4,3" />
        <text x="120" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">2. TOP LID PANEL</text>
        <text x="120" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">12mm Plywood + Cleat Frame</text>
        <text x="120" y="114" fill="#78716c" font-size="9" text-anchor="middle">${e.w} × ${e.l} cm</text>
      </g>

      <!-- Panel 3: Long Side Panel 1 -->
      <g transform="translate(580, 90)">
        <rect x="0" y="0" width="280" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="280" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <!-- Cleat frame & diagonal brace -->
        <rect x="6" y="6" width="268" height="158" fill="none" stroke="#d97706" stroke-width="1.5" />
        <line x1="6" y1="6" x2="274" y2="164" stroke="#d97706" stroke-width="1.5" />
        <text x="140" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">3. LONG SIDE (2×)</text>
        <text x="140" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">12mm Plywood + Diagonal Cleat</text>
        <text x="140" y="114" fill="#78716c" font-size="9" text-anchor="middle">${e.l} × ${e.h} cm</text>
      </g>

      <!-- Panel 4: End Panel (2x) -->
      <g transform="translate(40, 290)">
        <rect x="0" y="0" width="180" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="180" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <rect x="6" y="6" width="168" height="158" fill="none" stroke="#d97706" stroke-width="1.5" />
        <text x="90" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">4. END PANEL (2×)</text>
        <text x="90" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">12mm Plywood Cleated</text>
        <text x="90" y="114" fill="#78716c" font-size="9" text-anchor="middle">${e.w} × ${e.h} cm</text>
      </g>

      <!-- Skid Detail -->
      <g transform="translate(250, 290)">
        <rect x="0" y="0" width="610" height="80" rx="4" fill="#1c1917" stroke="#f59e0b" stroke-width="1.2" />
        <text x="20" y="26" fill="#f59e0b" font-size="11" font-weight="bold">5. SOLID PINE SKID RUNNERS (3× RUNNERS)</text>
        <text x="20" y="46" fill="#ffffff" font-size="10">89 × 89 × ${Math.round(e.l*10)} mm Solid Pine HT · 45° chamfers on leading edges for pallet jacks</text>
        <!-- Chamfer diagram -->
        <polygon points="540,65 560,35 590,35 590,65" fill="#d97706" fill-opacity="0.4" stroke="#d97706" stroke-width="1.5" />
        <text x="565" y="24" fill="#78716c" font-size="8" text-anchor="middle">45° Chamfer</text>
      </g>

      <!-- Hardware & Assembly note -->
      <g transform="translate(250, 390)">
        <rect x="0" y="0" width="610" height="70" rx="4" fill="#141819" stroke="#ffffff" stroke-opacity="0.1" />
        <text x="20" y="24" fill="#94a3b8" font-size="10" font-weight="bold">ASSEMBLY FASTENING SPECIFICATION:</text>
        <text x="20" y="42" fill="#64748b" font-size="9">• Skid runners through-screwed from floor using #10 × 3" exterior screws @ 150mm spacing</text>
        <text x="20" y="56" fill="#64748b" font-size="9">• Wall cleats ring-shank nailed or screwed from exterior; top lid fastened with removable Torx T25 screws</text>
      </g>
    </svg>`;{const d=t.style==="pallet_gma";return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%" style="background:#090b0e; font-family: ui-monospace, monospace;">
      <text x="40" y="32" fill="#38bdf8" font-size="14" font-weight="bold">${d?'GMA NORTH AMERICA (48×40") FREIGHT PALLET':"EUR / EPAL 1 STANDARD FREIGHT PALLET"}</text>
      <text x="40" y="48" fill="#64748b" font-size="10">Overall Dimensions: ${e.w} × ${e.l} × ${e.h} cm · 4-Way Entry</text>

      <!-- Pallet Top View Diagram -->
      <g transform="translate(60, 80)">
        <rect x="0" y="0" width="300" height="360" rx="4" fill="#1e293b" fill-opacity="0.3" stroke="#38bdf8" stroke-width="1.5" />
        <!-- Top deckboards -->
        <rect x="0" y="0" width="300" height="35" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="50" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="100" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="150" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="200" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="260" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="325" width="300" height="35" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />

        <!-- Runners visible through gaps (dashed) -->
        <line x1="15" y1="0" x2="15" y2="360" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="150" y1="0" x2="150" y2="360" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="285" y1="0" x2="285" y2="360" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />

        <text x="150" y="190" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">TOP DECK (7 BOARDS)</text>
      </g>

      <!-- Side Elevation with Notches -->
      <g transform="translate(400, 100)">
        <text x="0" y="0" fill="#38bdf8" font-size="11" font-weight="bold">STRINGER ELEVATION WITH FORKLIFT NOTCHES</text>
        <rect x="0" y="15" width="340" height="70" fill="#f59e0b" fill-opacity="0.2" stroke="#f59e0b" stroke-width="1.5" />
        <!-- Notches -->
        <rect x="40" y="55" width="80" height="30" fill="#090b0e" stroke="#f59e0b" stroke-width="1.2" />
        <rect x="220" y="55" width="80" height="30" fill="#090b0e" stroke="#f59e0b" stroke-width="1.2" />
        <text x="80" y="72" fill="#f59e0b" font-size="9" text-anchor="middle">Fork Notch</text>
        <text x="260" y="72" fill="#f59e0b" font-size="9" text-anchor="middle">Fork Notch</text>
      </g>

      <!-- Spec details -->
      <g transform="translate(400, 240)">
        <rect x="0" y="0" width="340" height="200" rx="4" fill="#141819" stroke="#ffffff" stroke-opacity="0.1" />
        <text x="16" y="24" fill="#ffffff" font-size="11" font-weight="bold">SPECIFICATIONS & COMPLIANCE</text>
        <text x="16" y="48" fill="#94a3b8" font-size="10">• Standard: ${d?"NWPCA GMA (US Dry Van)":"EPAL 1 (European Logistics)"}</text>
        <text x="16" y="68" fill="#94a3b8" font-size="10">• Dynamic Load: ${d?"1,134 kg (2,500 lbs)":"1,500 kg (3,300 lbs)"}</text>
        <text x="16" y="88" fill="#94a3b8" font-size="10">• Static Load: 4,000 kg (8,800 lbs)</text>
        <text x="16" y="108" fill="#94a3b8" font-size="10">• Phytosanitary: IPPC ISPM-15 Heat-Treated (HT 56°C/30m)</text>
        <text x="16" y="128" fill="#94a3b8" font-size="10">• Tare Weight: ~${t.tareWeightKg} kg</text>
        <text x="16" y="148" fill="#94a3b8" font-size="10">• 4-Way Entry (Forklift & Pallet Jack)</text>
      </g>
    </svg>`}}}function Q(t){let r=0,o=0,e=0,n=0,c=!1,x=!1;t.forEach(d=>{const i=d.data||d,l=Number(i.width_cm||i.widthCm||20),f=Number(i.length_cm||i.lengthCm||20),m=Number(i.height_cm||i.heightCm||20),a=Number(i.weight_kg||i.weightKg||5),y=Number(i.quantity||1);r+=a*y,o=Math.max(o,l),e=Math.max(e,f),n=Math.max(n,m);const h=`${i.shortDescription||""} ${i.shape||""} ${i.type||""}`.toLowerCase();(h.includes("mirror")||h.includes("panel")||h.includes("sconce"))&&(c=!0),(h.includes("sculpture")||h.includes("mesa")||h.includes("table")||a>25)&&(x=!0)});const g=t.length;if(x||r>35||o>90||e>90||n>90){const d={w:Math.ceil(o+6),l:Math.ceil(e+6),h:Math.ceil(n+6)},i=z({kind:"crate",style:"crate_cleated",dimBasis:"inside",innerCm:d,boardThicknessMm:12,foamPaddingMm:25}),l={kind:"crate",style:"crate_cleated",dimBasis:"inside",innerCm:i.innerCm,outerCm:i.outerCm,materialId:"ply_12_ht_pine",boardThicknessMm:12,cleatMm:{thick:19,width:89},skidMm:{height:89,width:89,count:3,chamfered:!0},deckboards:{countTop:0,countBottom:0,thickMm:0,widthMm:0,fourWayNotched:!1},foamPaddingMm:25,ispm15Ht:!0,tareWeightKg:0,estimatedCostMxn:0},f=N(l);return l.tareWeightKg=f.tareWeightKg,l.estimatedCostMxn=f.estimatedCostMxn,l}else{if(g>8&&r>150)return{kind:"pallet",style:"pallet_gma",dimBasis:"outside",innerCm:{w:101.6,l:121.9,h:120},outerCm:{w:101.6,l:121.9,h:14},materialId:"pine_ht_solid",boardThicknessMm:20,cleatMm:{thick:19,width:89},skidMm:{height:89,width:38,count:3,chamfered:!0},deckboards:{countTop:7,countBottom:5,thickMm:20,widthMm:95,fourWayNotched:!0},foamPaddingMm:0,ispm15Ht:!0,tareWeightKg:T.gma.tareKg,estimatedCostMxn:T.gma.costMxn};{const d=c?20:15,i={w:Math.max(16,Math.ceil(o+d*2/10)),l:Math.max(16,Math.ceil(e+d*2/10)),h:Math.max(12,Math.ceil(n+d*2/10))},l=z({kind:"cardboard",style:"fefco_0201",dimBasis:"inside",innerCm:i,boardThicknessMm:7,foamPaddingMm:d}),f={kind:"cardboard",style:"fefco_0201",dimBasis:"inside",innerCm:l.innerCm,outerCm:l.outerCm,materialId:"flute_bc_7",boardThicknessMm:7,cleatMm:{thick:19,width:89},skidMm:{height:0,width:0,count:0,chamfered:!1},deckboards:{countTop:0,countBottom:0,thickMm:0,widthMm:0,fourWayNotched:!1},foamPaddingMm:d,ispm15Ht:!1,tareWeightKg:0,estimatedCostMxn:0},m=N(f);return f.tareWeightKg=m.tareWeightKg,f.estimatedCostMxn=m.estimatedCostMxn,f}}}function Z(t,r){const o=new Blob([r],{type:"image/svg+xml;charset=utf-8"}),e=URL.createObjectURL(o),n=document.createElement("a");n.href=e,n.download=t.endsWith(".svg")?t:`${t}.svg`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(e)}async function tt(t,r,o="Packaging Specification"){const e=new O({orientation:"portrait",unit:"mm",format:"letter"}),n=e.internal.pageSize.getWidth();e.setFillColor(15,23,42),e.rect(0,0,n,28,"F"),e.setTextColor(255,255,255),e.setFontSize(16),e.setFont("helvetica","bold"),e.text("ONYX.MX PACKAGING STUDIO",14,12),e.setFontSize(10),e.setFont("helvetica","normal"),e.setTextColor(148,163,184),e.text(`WORKSHOP CUT LIST & SPECIFICATION SHEET — ${o.toUpperCase()}`,14,20),e.setDrawColor(203,213,225),e.setFillColor(248,250,252),e.roundedRect(14,34,n-28,38,3,3,"FD"),e.setTextColor(15,23,42),e.setFontSize(11),e.setFont("helvetica","bold"),e.text(`Packaging Type: ${t.kind.toUpperCase()} (${t.style})`,20,42),e.setFontSize(9),e.setFont("helvetica","normal"),e.text(`Internal Cavity: ${t.innerCm.w} × ${t.innerCm.l} × ${t.innerCm.h} cm (${(t.innerCm.w*t.innerCm.l*t.innerCm.h/1e3).toFixed(1)} L)`,20,49),e.text(`External Footprint: ${t.outerCm.w} × ${t.outerCm.l} × ${t.outerCm.h} cm (${(t.outerCm.w*t.outerCm.l*t.outerCm.h/1e6).toFixed(3)} m³)`,20,56),e.text(`Material: ${t.materialId} · Board: ${t.boardThicknessMm}mm · Foam: ${t.foamPaddingMm}mm`,20,63),e.text(`Tare Weight: ~${r.tareWeightKg} kg`,120,49),e.text(`Est. Cost: $${r.estimatedCostMxn.toLocaleString()} MXN`,120,56),e.text(`Phytosanitary: ${t.ispm15Ht?"ISPM-15 Heat-Treated (HT 56°C/30m MX-HT-042)":"Non-Wood Exempt"}`,120,63);const c=r.items.map(g=>[g.part,g.qty.toString(),g.material,g.dimsMm,g.purpose]);_(e,{startY:78,head:[["Part Name","Qty","Material","Dimensions (W × L × T)","Assembly Purpose"]],body:c,theme:"grid",headStyles:{fillColor:[30,41,59],textColor:[255,255,255],fontStyle:"bold",fontSize:9},bodyStyles:{fontSize:8.5,textColor:[30,41,59]},alternateRowStyles:{fillColor:[248,250,252]},margin:{left:14,right:14}});const x=e.lastAutoTable.finalY+12;e.setFontSize(8),e.setTextColor(100,116,139),e.text("Compliance Note: Cross-border trade Mexico-USA requires IPPC HT stamp verification on all solid pine runners & cleats.",14,x),e.text(`Generated by Onyx.mx Logistics Hub on ${new Date().toLocaleDateString()}`,14,x+5),e.save(`${t.kind}_${t.style}_specification.pdf`)}async function et(t,r,o="Packaging Cut List"){const e=new U.Workbook;e.creator="Onyx.mx Logistics Packaging Studio",e.created=new Date;const n=e.addWorksheet("Cut List & BOM");n.mergeCells("A1:E1");const c=n.getCell("A1");c.value=`ONYX.MX PACKAGING BOM — ${o.toUpperCase()}`,c.font={name:"Arial",size:14,bold:!0,color:{argb:"FFFFFFFF"}},c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1E293B"}},c.alignment={vertical:"middle",horizontal:"left",indent:1},n.getRow(1).height=30,n.addRow(["Packaging Type",`${t.kind.toUpperCase()} (${t.style})`]),n.addRow(["Inside Dimensions (cm)",`${t.innerCm.w} × ${t.innerCm.l} × ${t.innerCm.h} cm`]),n.addRow(["Outside Dimensions (cm)",`${t.outerCm.w} × ${t.outerCm.l} × ${t.outerCm.h} cm`]),n.addRow(["Tare Weight (kg)",r.tareWeightKg]),n.addRow(["Estimated Cost (MXN)",r.estimatedCostMxn]),n.addRow(["ISPM-15 Phytosanitary",t.ispm15Ht?"YES (Heat-Treated HT)":"NO (Exempt)"]),n.addRow([]);const x=n.addRow(["Part Name","Qty","Material","Dimensions (mm)","Purpose"]);x.font={name:"Arial",size:10,bold:!0,color:{argb:"FFFFFFFF"}},x.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF334155"}},n.getRow(9).height=22,r.items.forEach(f=>{n.addRow([f.part,f.qty,f.material,f.dimsMm,f.purpose])}),n.columns=[{key:"part",width:32},{key:"qty",width:8},{key:"material",width:34},{key:"dims",width:30},{key:"purpose",width:50}];const g=await e.xlsx.writeBuffer(),d=new Blob([g],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),i=URL.createObjectURL(d),l=document.createElement("a");l.href=i,l.download=`${t.kind}_${t.style}_cutlist.xlsx`,document.body.appendChild(l),l.click(),document.body.removeChild(l),URL.revokeObjectURL(i)}function ot(t){const r=Math.round(t.innerCm.w*10),o=Math.round(t.innerCm.l*10),e=Math.round(t.innerCm.h*10);return`# Boxes.py Divider Recipe for Onyx Workshop Laser PC
# Run in terminal with python -m boxes or boxes.exe:
boxes.exe TypeTray --sx="${Math.round(r/2)}*2" --sy="${Math.round(o/2)}*2" --h=${e} --thickness=3 --burn=${.09} --output=divider_${r}x${o}.svg`}export{L as C,E as P,z as a,J as b,N as c,T as d,Z as e,tt as f,j as g,et as h,ot as i,Q as r};
