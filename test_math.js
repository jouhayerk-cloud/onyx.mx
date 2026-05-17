const cos30 = Math.cos(Math.PI / 6);
const sin30 = Math.sin(Math.PI / 6);

const W = 8;
const H = 35;
const D = 8;

const a = (W/2)*cos30, b = -(W/2)*sin30;
const c = -(D/2)*cos30, d = -(D/2)*sin30;

const t1 = Math.atan2(-D, W); // Right-most tangent parameter
const t2 = Math.atan2(D, -W); // Left-most tangent parameter

const x1 = Math.cos(t1), z1 = Math.sin(t1);
const x2 = Math.cos(t2), z2 = Math.sin(t2);

const u1 = a*x1 + c*z1, v1 = b*x1 + d*z1;
const u2 = a*x2 + c*z2, v2 = b*x2 + d*z2;

console.log(`t1 = ${t1}, u1 = ${u1}, v1 = ${v1}`);
console.log(`t2 = ${t2}, u2 = ${u2}, v2 = ${v2}`);

let maxU = -Infinity, minU = Infinity;
for (let t = 0; t <= 2*Math.PI; t+=0.01) {
    const x = Math.cos(t), z = Math.sin(t);
    const u = a*x + c*z;
    if (u > maxU) maxU = u;
    if (u < minU) minU = u;
}
console.log(`Empirical maxU = ${maxU}, minU = ${minU}`);
