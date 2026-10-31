// A small inline formatter: builds DOM nodes, never interprets raw HTML.
export function formatArticle(root, text){
 root.replaceChildren();
 function inline(parent,source,depth=0){
  if(depth>5){parent.append(document.createTextNode(source));return;}
  const pattern=/\*\*([^\n]+?)\*\*|\*([^*\n]+?)\*|\[([^\]\n]+)\]\(([^\s)]+)\)|__([^_\n]+)__/g;
  let previous=0,match;
  while((match=pattern.exec(source))){
   parent.append(document.createTextNode(source.slice(previous,match.index)));
   let node;
   if(match[1]!==undefined){node=document.createElement('strong');inline(node,match[1],depth+1);}
   else if(match[2]!==undefined){node=document.createElement('em');inline(node,match[2],depth+1);}
   else if(match[5]!==undefined){node=document.createElement('u');inline(node,match[5],depth+1);}
   else{
    try{const url=new URL(match[4]);if(!['http:','https:'].includes(url.protocol))throw Error();node=document.createElement('a');node.href=url.href;node.target='_blank';node.rel='noopener noreferrer';node.textContent=match[3];}
    catch{node=document.createTextNode(match[0]);}
   }
   parent.append(node);previous=pattern.lastIndex;
  }
  parent.append(document.createTextNode(source.slice(previous)));
 }
 let list=null,listType=null;
 for(const line of String(text||'').split('\n')){
  const item=line.match(/^\s*(-|\d+\.)\s+(.+)$/);
  if(item){const type=item[1]==='-'?'ul':'ol';if(!list||listType!==type){list=document.createElement(type);root.append(list);listType=type;}const li=document.createElement('li');inline(li,item[2]);list.append(li);}
  else{list=null;listType=null;if(!line.trim()){root.append(document.createElement('br'));continue;}const p=document.createElement('p');inline(p,line);root.append(p);}
 }
}
export function applyArticleStyle(root, alignment='left', fontSize=18){
 root.style.textAlign=['left','center','right','justify'].includes(alignment)?alignment:'left';
 root.style.fontSize=([14,16,18,20,22,24].includes(Number(fontSize))?Number(fontSize):18)+'px';
}
