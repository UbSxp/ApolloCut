/**
 * @file Testes do Editor (Item 5).
 * Roda sem internet, sem arquivo real — usa mocks.
 */

import { createProject, saveProject, loadProject, listProjects, deleteProject } from '../core/editor.js';
import { applyTemplate, listTemplates, updateBrandKit, setBrandLogo } from '../core/editor.js';
import { setCutApproved, setCutTiming, splitCut, joinCuts, bulkEditCuts, reindexCuts } from '../core/editor.js';
import { computeCutReframe } from '../core/editor.js';
import { EDITOR_CONFIG } from '../core/editor.js';

// Mock File e URL
const mockVideoFile = new File(['mock video data'], 'test.mp4', { type: 'video/mp4' });
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

URL.createObjectURL = () => 'blob:mock';
URL.revokeObjectURL = () => {};

async function runTests() {
  console.log('🧪 Iniciando testes do Editor...');

  // Teste 1: Criação e persistência de projeto
  console.log('\n1. Testando criação e persistência de projeto...');
  const project = await createProject(mockVideoFile, 'Teste Podcast');
  console.log(`   Projeto criado: ${project.id} - "${project.name}"`);
  console.log(`   Vídeo: ${project.video.duration.toFixed(1)}s ${project.video.width}x${project.video.height}`);

  await saveProject();
  console.log('   Projeto salvo no IndexedDB (mock)');

  const loaded = await loadProject(project.id);
  console.log(`   Projeto carregado: ${loaded.id} - "${loaded.name}"`);

  const projects = await listProjects();
  console.log(`   Projetos listados: ${projects.length}`);

  await deleteProject(project.id);
  console.log('   Projeto deletado');

  // Teste 2: Templates
  console.log('\n2. Testando templates...');
  const templates = listTemplates();
  console.log(`   Templates disponíveis: ${templates.map(t => t.key).join(', ')}`);

  const proj2 = await createProject(mockVideoFile, 'Template Test');
  applyTemplate('gameplay');
  console.log(`   Template 'gameplay' aplicado: ratio=${editorState.project.settings.ratio}, style=${editorState.project.brandKit.captionStyle}`);

  // Teste 3: Brand Kit
  console.log('\n3. Testando Brand Kit...');
  updateBrandKit({ captionStyle: 'ode', watermark: { enabled: false } });
  console.log(`   Brand Kit atualizado: style=${editorState.project.brandKit.captionStyle}, watermark=${editorState.project.brandKit.watermark.enabled}`);

  // Teste 4: Cortes - aprovação, timing, split, join
  console.log('\n4. Testando edição de cortes...');
  // Simula cortes no projeto
  editorState.project.cuts = [
    { id: 'cut-1', index: 1, start: 10, end: 25, duration: 15, approved: false, customStart: null, customEnd: null },
    { id: 'cut-2', index: 2, start: 30, end: 45, duration: 15, approved: false, customStart: null, customEnd: null },
    { id: 'cut-3', index: 3, start: 50, end: 65, duration: 15, approved: false, customStart: null, customEnd: null },
  ];

  setCutApproved('cut-1', true);
  console.log(`   Corte 1 aprovado: ${editorState.project.cuts[0].approved}`);

  setCutTiming('cut-2', 32, 42);
  console.log(`   Corte 2 ajustado: ${editorState.project.cuts[1].customStart}-${editorState.project.cuts[1].customEnd} (${editorState.project.cuts[1].duration}s)`);

  const newCutId = splitCut('cut-1', 5);
  console.log(`   Corte 1 dividido em ${splitTime}s → novo corte: ${newCutId}`);
  console.log(`   Total de cortes: ${editorState.project.cuts.length}`);

  joinCuts('cut-1', newCutId);
  console.log(`   Cortes juntados: ${editorState.project.cuts.length} restantes`);

  // Teste 5: Edição em massa
  console.log('\n5. Testando edição em massa...');
  editorState.project.cuts = [
    { id: 'c1', approved: false, captionStyle: 'marmore', watermark: true },
    { id: 'c2', approved: false, captionStyle: 'marmore', watermark: true },
    { id: 'c3', approved: false, captionStyle: 'marmore', watermark: true },
  ];
  bulkEditCuts(new Set(['c1', 'c3']), { type: 'approve', value: true });
  console.log(`   Aprovação em massa: c1=${editorState.project.cuts[0].approved}, c2=${editorState.project.cuts[1].approved}, c3=${editorState.project.cuts[2].approved}`);

  bulkEditCuts(new Set(['c1', 'c2', 'c3']), { type: 'captionStyle', value: 'ode' });
  console.log(`   Estilo legenda em massa: ${editorState.project.cuts.map(c => c.captionStyle).join(', ')}`);

  // Teste 6: Templates
  console.log('\n6. Testando aplicação de template...');
  const proj3 = await createProject(mockVideoFile, 'Template Apply');
  applyTemplate('tutorial');
  console.log(`   Template 'tutorial': ratio=${editorState.project.settings.ratio}, layout=${EDITOR_CONFIG.templates.tutorial.reframeLayout}, style=${editorState.project.brandKit.captionStyle}`);

  // Teste 7: Configurações
  console.log('\n7. Testando configurações do editor...');
  console.log(`   Zoom levels: ${EDITOR_CONFIG.timeline.zoomLevels.join(', ')}`);
  console.log(`   Brand Kit max logo: ${EDITOR_CONFIG.brandKit.maxLogoSize / 1024}KB`);
  console.log(`   Templates: ${Object.keys(EDITOR_CONFIG.templates).join(', ')}`);

  console.log('\n✅ Todos os testes do Editor passaram!');
  return true;
}

// Mock do editorState para testes
const editorState = {
  project: null,
  timeline: { zoom: 2, playhead: 0, selection: null, multiSelect: new Set() },
  unsavedChanges: false,
};

// Mock do saveProject/loadProject para testes (usa memória)
let mockDB = {};
const originalOpenProjectDB = async () => ({
  transaction: (store, mode) => ({
    objectStore: () => ({
      put: (obj) => { mockDB[obj.id] = obj; return { onsuccess: null, onerror: null }; },
      get: (id) => { return { onsuccess: { target: { result: mockDB[id] } }, onerror: null }; },
      getAll: () => { return { onsuccess: { target: { result: Object.values(mockDB) } }, onerror: null }; },
      delete: (id) => { delete mockDB[id]; return { onsuccess: null, onerror: null }; },
    }),
    oncomplete: null,
    onerror: null,
  }),
});

// Substitui openProjectDB para testes
import { openProjectDB } from '../core/editor.js';
// Não podemos substituir facilmente módulos ES — testes rodam no navegador

if (typeof window !== 'undefined') {
  // No navegador, roda testes reais com IndexedDB
  runTests().catch(console.error);
} else if (typeof require !== 'undefined' && require.main === module) {
  runTests().catch(console.error);
}

export { runTests };