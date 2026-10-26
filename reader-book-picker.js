import {escapeHTML as e} from './core.js';

// Suggestions use the current full library, independently of its page filters.
export function mountReaderBookPicker(root, books) {
  const input=root.querySelector('[name="title"]');
  const list=root.querySelector('#reader-book-options');
  const hint=root.querySelector('#reader-book-hint');
  const author=root.closest('form').querySelector('[name="author"]');
  const indexed=books.map(book=>({book,text:`${book.title} ${book.author||''}`.normalize('NFKC').toLocaleLowerCase()}));
  let matches=[],active=-1,selectedAuthor=null;
  const close=()=>{
    list.hidden=true;input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');active=-1;
  };
  const highlight=index=>{
    active=index;
    list.querySelectorAll('[role="option"]').forEach((option,i)=>{
      option.setAttribute('aria-selected',String(i===active));
      if(i===active){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
    });
  };
  const choose=index=>{
    const book=matches[index];if(!book)return;
    input.value=book.title;author.value=book.author==='未知作者'?'':book.author||'';
    selectedAuthor=author.value;input.focus();close();hint.textContent='已选用书库中的书名和作者，可继续修改。';
  };
  const search=()=>{
    const terms=input.value.trim().normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    close();
    if(!terms.length){hint.textContent='输入书名或作者搜索全部书籍，也可直接填写新书名。';return;}
    const found=indexed.filter(item=>terms.every(term=>item.text.includes(term)));
    matches=found.slice(0,20).map(item=>item.book);
    hint.textContent=found.length?`找到 ${found.length} 本${found.length>20?'，显示前 20 本，请继续输入缩小范围':''}；选择一项，或保留手动输入。`:'书库中没有匹配项，可直接保存手动输入的书名。';
    if(!matches.length)return;
    list.innerHTML=matches.map((book,index)=>`<button type="button" role="option" id="reader-book-option-${index}" aria-selected="false" tabindex="-1" data-book-option="${index}"><span>${e(book.title)}</span><small>${e(book.author||'未知作者')}${book.category?' · '+e(book.category):''}</small></button>`).join('');
    list.hidden=false;input.setAttribute('aria-expanded','true');
  };
  input.addEventListener('input',()=>{
    if(selectedAuthor!==null){if(author.value===selectedAuthor)author.value='';selectedAuthor=null;}
    search();
  });
  input.addEventListener('focus',search);
  input.addEventListener('keydown',event=>{
    if(event.isComposing||list.hidden)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();highlight((active+(event.key==='ArrowDown'?1:active<0?0:-1)+matches.length)%matches.length);
    }
    if(event.key==='Enter'&&active>=0){event.preventDefault();choose(active);}
  });
  list.addEventListener('mousedown',event=>event.preventDefault());
  list.addEventListener('click',event=>{
    const option=event.target.closest('[data-book-option]');if(option)choose(Number(option.dataset.bookOption));
  });
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))close();});
}
