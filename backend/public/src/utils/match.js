export function stripDiacritics(s){ return s.normalize('NFD').replace(/\p{Diacritic}/gu,''); }
export function normalize(s){ return stripDiacritics(String(s||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').trim()); }

export function levenshtein(a,b){
  if(a===b) return 0;
  if(a.length===0) return b.length;
  if(b.length===0) return a.length;
  const v0 = new Array(b.length+1), v1 = new Array(b.length+1);
  for(let i=0;i<=b.length;i++) v0[i]=i;
  for(let i=0;i<a.length;i++){
    v1[0]=i+1;
    for(let j=0;j<b.length;j++){
      const cost = a[i]===b[j]?0:1;
      v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
    }
    for(let j=0;j<=b.length;j++) v0[j]=v1[j];
  }
  return v0[b.length];
}
