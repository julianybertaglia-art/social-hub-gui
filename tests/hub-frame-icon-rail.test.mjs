import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const frame=readFileSync(new URL('../app/HubFrame.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/hub-frame.module.css',import.meta.url),'utf8');

test('botão alterna entre versão completa e barra compacta, preservando preferência',()=>{
 assert.match(frame,/onClick=\{toggleSidebar\}/);
 assert.match(frame,/setSidebarCollapsed\(next\)/);
 assert.match(frame,/localStorage\.setItem\('tideplace:sidebar-collapsed'/);
 assert.match(frame,/sidebarCollapsed \? 'Expandir menu lateral' : 'Reduzir menu lateral'/);
 assert.match(frame,/aria-controls="tideplace-navigation"/);
});
test('menu compacto continua visível com ícones e largura reduzida no desktop',()=>{
 assert.match(css,/\.frame\.sidebarCollapsed\{--frame-sidebar:72px\}/);
 assert.match(css,/\.sidebarCollapsed \.sidebar\{transform:none;visibility:visible;pointer-events:auto/);
 assert.match(css,/\.sidebarCollapsed \.navLink > span:not\(\.icon\)\{display:none\}/);
 assert.match(css,/\.sidebarCollapsed \.navLink \.icon\{/);
 assert.doesNotMatch(css,/\.frame\.sidebarCollapsed\{--frame-sidebar:0px\}/);
});
test('a tela principal acompanha a largura do menu, mantendo comportamento mobile',()=>{
 assert.match(css,/\.main\{min-height:100vh;margin-left:var\(--frame-sidebar\)/);
 assert.match(css,/@media\(max-width:810px\)\{/);
 assert.match(css,/@media\(min-width:811px\)\{/);
});
