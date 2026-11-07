class MiniElement {
  constructor(nodeName, attributes, childNodes, textContent) {
    this.nodeType = 1;
    this.nodeName = nodeName;
    this.attributes = attributes;
    this.childNodes = childNodes;
    this.textContent = textContent;
  }
}

class MiniTextNode {
  constructor(text) {
    this.nodeType = 3;
    this.nodeName = '#text';
    this.textContent = text;
    this.attributes = [];
    this.childNodes = [];
  }
}

function parseXmlToDom(xml) {
  const str = String(xml).replace(/^\uFEFF/, '');
  const len = str.length;
  let i = 0;

  function skipProlog() {
    while (i < len) {
      if (str.startsWith('<?', i)) {
        const e = str.indexOf('?>', i);
        i = e < 0 ? len : e + 2;
      } else if (str.startsWith('<!--', i)) {
        const e = str.indexOf('-->', i);
        i = e < 0 ? len : e + 3;
      } else if (str.startsWith('<!', i)) {
        const e = str.indexOf('>', i);
        i = e < 0 ? len : e + 1;
      } else {
        break;
      }
    }
  }

  function parseElement() {
    if (str[i] !== '<') throw new Error('not an element');
    const nameStart = i + 1;
    let nameEnd = nameStart;
    while (nameEnd < len && !" \t\r\n>/".includes(str[nameEnd])) nameEnd += 1;
    const name = str.slice(nameStart, nameEnd);
    let p = nameEnd;
    const attrs = [];
    let tagEnd = -1;
    let selfClose = false;
    let q = -1;
    for (let k = p; k < len; k += 1) {
      const c = str[k];
      if (q >= 0) {
        if (c === q) q = -1;
        continue;
      }
      if (c === '"') {
        q = c;
        continue;
      }
      if (c === "'") {
        q = c;
        continue;
      }
      if (c === '>') {
        tagEnd = k;
        if (str[k - 1] === '/') selfClose = true;
        break;
      }
    }
    if (tagEnd < 0) throw new Error('unclosed element');
    const inner = str.slice(p, tagEnd);
    let attrPos = 0;
    while (attrPos < inner.length) {
      const sp = inner.indexOf('=', attrPos);
      if (sp < 0) break;
      const eq = inner[sp];
      const nEnd = sp;
      let nStart = attrPos;
      while (nStart < nEnd && !" \t\r\n=".includes(inner[nStart])) nStart += 1;
      const attrName = inner.slice(nStart, nEnd);
      const vStart = sp + 1;
      const vEnd = inner.indexOf(eq === '=' ? '"' : "'", vStart);
      const quote = inner[vStart];
      const val = inner.slice(vStart + 1, vEnd);
      attrs.push({ name: attrName, value: val });
      attrPos = vEnd + 1;
    }
    const element = new MiniElement(name, attrs, [], '');
    if (selfClose) {
      i = tagEnd + 1;
      return element;
    }
    i = tagEnd + 1;
    const children = [];
    const childNodes = [];
    const textParts = [];
    let text = '';
    while (true) {
      while (i < len && ' \t\r\n'.includes(str[i])) i += 1;
      if (str.startsWith('</', i)) {
        const e = str.indexOf('>', i);
        const closeTag = str.slice(i + 2, e).trim();
        if (closeTag === name) {
          i = e + 1;
          break;
        }
        throw new Error('mismatched tag ' + closeTag);
      }
      if (str.startsWith('<!--', i)) {
        const e = str.indexOf('-->', i);
        i = e < 0 ? len : e + 3;
        continue;
      }
      if (str.startsWith('<![CDATA[', i)) {
        const e = str.indexOf(']]>', i);
        text += str.slice(i + 9, e);
        i = e + 3;
        continue;
      }
      if (str[i] === '<') {
        const child = parseElement();
        childNodes.push(child);
        continue;
      }
      const next = str.indexOf('<', i);
      const stop = next < 0 ? len : next;
      const chunk = str.slice(i, stop);
      if (chunk) text += chunk;
      if (next < 0) break;
      i = next;
    }
    if (text.trim() !== '') childNodes.push(new MiniTextNode(text));
    const textContent = childNodes.map((c) => (c.nodeType === 3 ? c.textContent : '')).join('');
    element.childNodes = childNodes;
    element.textContent = textContent;
    return element;
  }

  skipProlog();
  while (i < len && ' \t\r\n'.includes(str[i])) i += 1;
  const root = parseElement();
  return {
    documentElement: root,
    getElementsByTagName: () => [],
  };
}

function installDom() {
  globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  globalThis.DOMParser = class {
    parseFromString(xml) {
      return parseXmlToDom(xml);
    }
  };
}

export { installDom, parseXmlToDom };
