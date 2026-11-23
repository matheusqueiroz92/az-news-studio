# ADR 0001 — WordPress continua como CMS; Studio é um app separado

- Status: aceita
- Data: 2026-11-23

## Contexto

O site aznews.com.br roda em WordPress + Elementor + Yoast, com 8.642 matérias, URLs indexadas e tráfego do Google. A equipe domina Node.js/TypeScript/Next.js, não PHP. O objetivo imediato é automatizar produção e distribuição de conteúdo.

## Opções

A. Tudo em WordPress/PHP (plugin com as automações).
B. Reescrever o site em Next.js do zero.
C. WordPress como CMS + Studio separado em Next.js, integrado pela API REST.
D. WordPress headless + front em Next.js.

## Decisão

C agora. D reavaliada a partir do 6º mês.

## Consequências

- Valor entregue em semanas, sem risco para SEO e URLs.
- Duas aplicações para manter; um plugin PHP pequeno (`wordpress/az-bridge`) como ponte.
- O domínio acessa o CMS só via `CmsPort`; migrar para D ou B troca apenas o adaptador.
