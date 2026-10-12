import pymupdf, sys, collections, os
from fontTools.ttLib import TTFont
S=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG={"MonlamUniOuChan1":"orig-MonlamUniOuChan1.ttf","MonlamUniOuChan2":"orig-MonlamUniOuChan2.ttf",
      "Microsoft Himalaya":"orig-Himalaya.ttf","Tibetan_Machine_Uni":"orig-TibetanMachineUni.ttf"}
class Resolver:
    def __init__(self,path):
        f=TTFont(path); self.go=f.getGlyphOrder()
        cmap=f.getBestCmap(); self.inv={}
        for u,n in cmap.items():
            if n not in self.inv or u<self.inv[n]: self.inv[n]=u
        self.lig={}
        def walk(st):
            if st.LookupType==4:
                for first,ligs in st.ligatures.items():
                    for l in ligs: self.lig.setdefault(l.LigGlyph,[]).append([first]+list(l.Component))
            elif st.LookupType==1:
                for a,b in st.mapping.items(): self.lig.setdefault(b,[]).append([a])
            elif st.LookupType==7: walk(st.ExtSubTable)
        for lk in f['GSUB'].table.LookupList.Lookup:
            for st in lk.SubTable: walk(st)
        self.cache={}; self.ambig={}
    def res(self,name,depth=0):
        import re
        m=re.fullmatch(r"uni((?:[0-9A-F]{4})+)",name)
        if m:
            h=m.group(1); return "".join(chr(int(h[i:i+4],16)) for i in range(0,len(h),4))
        if name in self.inv and not (0xE000<=self.inv[name]<=0xF8FF): return chr(self.inv[name])
        if name in self.lig and depth<8:
            outs=[]
            for comps in self.lig[name]:
                s=""
                for c in comps:
                    r=self.res(c,depth+1)
                    if r is None: s=None; break
                    s+=r
                if s is not None and s not in outs: outs.append(s)
            if outs:
                if len(outs)>1: self.ambig[name]=outs
                return outs[0]
        if name in self.inv: return chr(self.inv[name])
        return None
    def gid(self,g):
        if g in self.cache: return self.cache[g]
        r=self.res(self.go[g]) if 0<=g<len(self.go) else None
        self.cache[g]=r; return r

resolvers={}
def get_resolver(base):
    for k,v in ORIG.items():
        if k in base:
            if k not in resolvers:
                p=os.path.join(S,"fonts",v)
                resolvers[k]=Resolver(p) if os.path.exists(p) else None
            return resolvers[k]
    return None

def fix_pdf(pdfpath,out):
    doc=pymupdf.open(pdfpath); pages=[]; unresolved=collections.Counter()
    for pno,page in enumerate(doc):
        chars=[]  # (y,x,text,size)
        for sp in page.get_texttrace():
            base=sp["font"].split("+")[-1]; rs=get_resolver(base)
            prev_resolved=False
            for c in sp["chars"]:
                u,g,(ox,oy),bbox=c
                if g==-1 and prev_resolved: continue  # continuation of a multi-codepoint ToUnicode entry already covered by GSUB
                txt=chr(u) if u>=0 else ""
                resolved=False
                if rs is not None and g>0:
                    r=rs.gid(g)
                    if r is not None: txt=r; resolved=True
                    else: unresolved[(base,g,txt)]+=1
                if g!=-1: prev_resolved=resolved
                chars.append((round(oy),ox,txt,sp["size"],bbox))
        # group into lines by baseline y
        chars.sort(key=lambda c:(c[0],c[1]))
        lines=[]; cur=[]; cy=None
        for c in chars:
            if cy is None or abs(c[0]-cy)<=3: cur.append(c); cy=c[0] if cy is None else cy
            else: lines.append(cur); cur=[c]; cy=c[0]
        if cur: lines.append(cur)
        outl=[]
        for ln in lines:
            ln.sort(key=lambda c:c[1]); s=""; lastx=None; prevc=None
            for c in ln:
                if prevc is not None and c[2]==prevc[2] and abs(c[1]-prevc[1])<0.6: continue  # drawn twice
                prevc=c
                if lastx is not None and c[4][0]-lastx>c[3]*0.9: s+="  "
                s+=c[2]; lastx=c[4][2]
            outl.append(s.rstrip())
        pages.append(f"\n\n===== PAGE {pno+1} =====\n"+"\n".join(outl))
    open(out,"w",encoding="utf-8").write("".join(pages))
    print("written",out)
    for k,v in unresolved.most_common(30): print("UNRESOLVED",k,v)
    for rs in resolvers.values():
        if rs and rs.ambig: print("AMBIGUOUS",len(rs.ambig),list(rs.ambig.items())[:10])

if __name__=="__main__":
    fix_pdf(sys.argv[1],sys.argv[2])
