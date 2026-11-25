-- Referencias de todas las categorías con fondos de MyInvestor (especificación, pestaña «Puntuación: opciones»,
-- «Referencias por categoría: decisiones»). Los sustitutos son fondos indexados o ETF de acumulación: la serie de
-- Morningstar es de precio, así que uno de distribución dejaría la referencia por debajo de su índice.

-- Versión cubierta a EUR de un índice: la usan las clases cubiertas de los fondos que lo siguen.
alter table fondos.indice add column cubierto text references fondos.indice(id);

insert into fondos.indice (id, nombre, proxy_isin, componentes) values
  ('msci-world-h',       'MSCI World (EUR cubierto)',               'IE00B03HD316', null), -- Vanguard Global Stock Index € H (2004)
  ('sp500-h',            'S&P 500 (EUR cubierto)',                  'IE00B1G3DH73', null), -- Vanguard US 500 Stock Index € H (2006)
  ('nasdaq100',          'Nasdaq-100',                              'IE0032077012', null), -- Invesco EQQQ Nasdaq-100 ETF (2002)
  ('msci-world-small',   'MSCI World Small Cap',                    'IE00B42W4L06', null), -- Vanguard Global Small-Cap Index € (2012)
  ('msci-world-salud',   'MSCI World Health Care',                  'IE00BM67HK77', null), -- Xtrackers MSCI World Health Care 1C (2016)
  ('iboxx-eur-hy',       'iBoxx € Liquid High Yield',               'LU1109943388', null), -- Xtrackers EUR High Yield Corp Bond 1C
  ('ibex35',             'IBEX 35 con dividendos',                  'ES0119203000', null), -- Santander Índice España I (2013)
  ('msci-europe-small',  'MSCI Europe Small Cap',                   'LU0322253906', null), -- Xtrackers MSCI Europe Small Cap 1C (2008)
  ('global-hy-h',        'High yield global (EUR cubierto)',        'LU2287755099', null), -- State Street Global HY Screened Index € H (2021)
  ('msci-china',         'MSCI China',                              'LU0625736789', null), -- Pictet China Index I USD (2011)
  ('global-corp-h',      'Bloomberg Global Corporate (EUR cubierto)', 'IE00BDFB5F89', null), -- Vanguard Global Corp Bond Index Ins Pl € H (2018)
  ('em-bond-h',          'Deuda emergente (EUR cubierto)',          'LU1373035663', null), -- iShares EM Govt Bond Index (LU) I2 € H (2016)
  ('bbg-commodity',      'Bloomberg Commodity',                     'IE00BDFL4P12', null), -- iShares Diversified Commodity Swap ETF
  ('mineras-oro',        'Mineras de oro (NYSE Arca Gold Miners)',  'IE00BQQP9F84', null), -- VanEck Gold Miners ETF
  ('msci-world-mat',     'MSCI World Materials',                    'IE00BM67HS53', null), -- Xtrackers MSCI World Materials 1C
  ('msci-world-energia', 'MSCI World Energy',                       'IE00BM67HM91', null), -- Xtrackers MSCI World Energy 1C
  ('recursos-naturales', 'Recursos naturales (50 % materiales + 50 % energía)', null,
   '[{"id": "msci-world-mat", "peso": 0.5}, {"id": "msci-world-energia", "peso": 0.5}]'),
  ('ls-global',          'Long/Short global (50 % MSCI World + 50 % €STR)', null,
   '[{"id": "msci-world", "peso": 0.5}, {"id": "estr", "peso": 0.5}]'),
  ('ls-europa',          'Long/Short Europa (50 % MSCI Europe + 50 % €STR)', null,
   '[{"id": "msci-europe", "peso": 0.5}, {"id": "estr", "peso": 0.5}]');

update fondos.indice set cubierto = 'msci-world-h' where id = 'msci-world';
update fondos.indice set cubierto = 'sp500-h' where id = 'sp500';

-- Una regla sin índice = la categoría no lleva referencia (renta fija, monetarios y mixtos en otras divisas sin
-- cubrir: compararlos con un índice en EUR haría pasar la divisa por habilidad).
alter table fondos.regla_indice alter column indice_id drop not null;

insert into fondos.regla_indice (orden, patron, indice_id) values
  (200, '^Sector Equity Technology$', 'nasdaq100'),
  (210, '^Global Small/Mid-Cap Equity$', 'msci-world-small'),
  (220, '^EUR (Diversified|Corporate|Government) Bond - Short Term$|^Global Short-Term Bond - EUR Hedged$|^Fixed Term Bond$'
        '|^Guaranteed Funds$|^Other Bond$|^Multistrategy EUR$|^Equity Market Neutral EUR$|^Macro Trading EUR$'
        '|^Systematic Trend EUR$|^Event Driven$|^Options Trading$|^Relative Value Arbitrage$|^Alternative Other$', 'estr'),
  (230, '^Sector Equity (Healthcare|Biotechnology)$', 'msci-world-salud'),
  (240, '^EUR High Yield Bond$', 'iboxx-eur-hy'),
  (250, '^Spain Equity$', 'ibex35'),
  (260, '^Europe Small-Cap Equity$|^Europe ex-UK Small/Mid-Cap Equity$|^Eurozone Small-Cap Equity$'
        '|^(Switzerland|Nordic|France) Small/Mid-Cap Equity$', 'msci-europe-small'),
  (270, '^Global High Yield Bond - EUR Hedged$', 'global-hy-h'),
  (280, '^China Equity$|^Greater China Equity$|^China Equity - A Shares$', 'msci-china'),
  (290, '^Thematic Equity|^Sector Equity (Consumer Goods & Services|Financial Services|Industrials|Energy|Listed Private Equity)$'
        '|^Asia-Pacific Equity$|^Property - Indirect (Global|Other)$', 'msci-world'),
  (300, '^Asia ex-Japan (Small/Mid-Cap )?Equity$|^Asia-Pacific ex-Japan Equity( Income)?$|^ASEAN Equity$|^India Equity$'
        '|^Indonesia Equity$|^Korea Equity$|^Taiwan Large-Cap Equity$|^Latin America Equity$|^Brazil Equity$'
        '|^Emerging Europe ex-Russia Equity$|^Africa( & Middle East)? Equity$|^Global Frontier Markets Equity$'
        '|^Global Emerging Markets Small/Mid-Cap Equity$', 'msci-em'),
  (310, '^US Small-Cap Equity$', 'sp500'),
  (320, '^Europe Mid-Cap Equity$|^Switzerland Equity$|^Germany Equity$|^Italy Equity$|^Nordic Equity$'
        '|^UK (Large-Cap|Flex-Cap) Equity$|^UK Equity Income$|^Property - Indirect Europe$', 'msci-europe'),
  (330, '^Eurozone Mid-Cap Equity$|^Property - Indirect Eurozone$', 'msci-emu'),
  (340, '^Japan Small/Mid-Cap Equity$', 'msci-japan'),
  (350, '^Australia & New Zealand Equity$', 'msci-pacific-xj'),
  (360, '^EUR Subordinated Bond$', 'euro-corp'),
  (370, '^EUR Inflation-Linked Bond$', 'euro-govt'),
  (380, '^Global Inflation-Linked Bond - EUR Hedged$', 'global-govt'),
  (390, '^Global Corporate Bond - EUR Hedged$', 'global-corp-h'),
  (400, '^Global Emerging Markets (Corporate )?Bond - EUR Hedged$', 'em-bond-h'),
  (410, '^Convertible Bond - Global, EUR Hedged$', 'mixto-30-70'),
  (420, '^Other Allocation$|^Global Emerging Markets Allocation$|^Target Date', 'mixto-50-50'),
  (430, '^Commodities - (Broad Basket|Precious Metals)$', 'bbg-commodity'),
  (440, '^Sector Equity Precious Metals$', 'mineras-oro'),
  (450, '^Sector Equity Natural Resources$', 'recursos-naturales'),
  (460, '^Long/Short Equity - (Global|US|Other)$', 'ls-global'),
  (470, '^Long/Short Equity - Europe$', 'ls-europa'),
  (480, '^(USD|GBP|CHF|JPY|NOK|SEK|DKK|RMB|AUD|CAD|HKD|SGD|PLN|CZK|HUF) |^Global .* - (USD|GBP|CHF) Hedged$'
        '|^Global (Diversified|Flexible|Short-Term|Corporate|Government|High Yield|Inflation-Linked) Bond$'
        '|^Global Emerging Markets Bond( - Local Currency)?$|^Convertible Bond - Global$|^China Bond$|^Asia High Yield Bond$'
        '|^Emerging Europe Bond$|^Money Market - Other$|^(Macro Trading|Systematic Trend|Multistrategy|Equity Market Neutral) USD$',
   null);

create or replace view fondos.categoria_referencia with (security_invoker = true) as
  with c as (
    select categoria, count(*) filter (where en_universo) as fondos
    from fondos.fondo where categoria is not null group by categoria)
  select c.categoria, c.fondos,
         r.indice_id,
         case when r.indice_id is not null then 'indice'
              when r.hay then 'ninguna'
              when c.fondos >= 5 then 'media_categoria'
              else 'ninguna' end as metodo
  from c
  left join lateral (select indice_id, true as hay from fondos.regla_indice
                     where c.categoria ~ patron order by orden limit 1) r on true;

-- Índice propio de cada fondo (fondo.indice_id, que manda sobre el de su categoría en metricas y en la web):
-- - las clases que Morningstar mete en «Other Equity/Bond/Allocation» por estar cubiertas usan el índice de la
--   categoría de su clase hermana (la más repetida entre las clases del mismo fondo);
-- - una clase cubierta (por el nombre, como `cubierta` en web/src/calculo/screener.ts) usa la versión cubierta del
--   índice, si existe.
-- Solo se guarda cuando difiere del índice de su categoría. Lo llama marcar_universo cada domingo.
create or replace function fondos.asignar_indices() returns integer
language sql
set search_path to ''
as $function$
  with cr as (select categoria, indice_id from fondos.categoria_referencia),
  base as (
    select f.isin, f.nombre, f.categoria,
           case when f.categoria ~ '^Other (Equity|Bond|Allocation)$' and f.fund_id is not null then
             (select h.categoria from fondos.fondo h
              where h.fund_id = f.fund_id and h.categoria is not null and h.categoria !~ '^Other'
              group by h.categoria order by count(*) desc, h.categoria limit 1) end as hermana
    from fondos.fondo f
    where f.en_universo or f.isin in (select isin from fondos.fondo_diario)),
  nuevo as (
    select b.isin, p.indice_id as propio,
           coalesce(case when b.nombre ~* '\m(hdg|hedged?)\M|(^|[[:space:](])H[0-9]?($|[[:space:])])' then i.cubierto end,
                    h.indice_id, p.indice_id) as elegido
    from base b
    left join cr p on p.categoria = b.categoria
    left join cr h on h.categoria = b.hermana
    left join fondos.indice i on i.id = coalesce(h.indice_id, p.indice_id)),
  cambio as (
    select isin, case when elegido is distinct from propio then elegido end as indice_id from nuevo),
  hecho as (
    update fondos.fondo f set indice_id = c.indice_id
    from cambio c
    where c.isin = f.isin and f.indice_id is distinct from c.indice_id
    returning 1)
  select count(*)::int from hecho;
$function$;

revoke execute on function fondos.asignar_indices() from public, anon, authenticated;

-- marcar_universo (0043) + asignar_indices al final
create or replace function fondos.marcar_universo(min_patrimonio_meur numeric default 50, min_anos integer default 3,
                                                  tope integer default 100, max_minima numeric default 10000)
returns integer
language sql
set search_path to ''
as $function$
  update fondos.fondo f set ultimo_valor = u.ultima
  from (select distinct on (fondo_id) fondo_id, make_date(ano, 1, 1) + (select max(d) from unnest(dias) d) as ultima
        from fondos.valor_anual order by fondo_id, ano desc) u
  where u.fondo_id = f.id and f.ultimo_valor is distinct from u.ultima;

  with apta as (
    select f.isin, coalesce(f.fund_id, f.isin) as fondo, f.categoria, f.patrimonio_meur, f.divisa, f.nombre,
           f.inversion_minima, f.ter, m.isin is not null as en_myinvestor
    from fondos.fondo f
    left join fondos.myinvestor m on m.isin = f.isin and m.abierto
    where f.categoria is not null
      and (m.isin is not null or f.patrimonio_meur >= min_patrimonio_meur)
      and f.fecha_lanzamiento <= current_date - make_interval(years => case when m.isin is not null then 1 else min_anos end)
      and f.actualizado_en > now() - interval '14 days'
      and (f.ultimo_valor is null or f.ultimo_valor >= current_date - 120)),
  clase as (
    select distinct on (fondo) isin, fondo, categoria, patrimonio_meur, en_myinvestor
    from apta
    order by fondo,
             en_myinvestor desc,
             (divisa = 'EUR') desc nulls last,
             fondos.es_particular(nombre, inversion_minima, max_minima) desc,
             (nombre ~* '(acc|acum|accumulation|capitalisation|thes)\M') desc,
             (nombre ~* '(dis|dist|distribution|inc|income)\M') asc,
             ter asc nulls last, isin),
  elegido as (
    select * from (
      select c.*, row_number() over (partition by categoria order by patrimonio_meur desc nulls last, isin) as puesto
      from clase c) x
    where puesto <= tope or en_myinvestor),
  dentro as (
    select a.isin from apta a join elegido e using (fondo)
    where a.isin = e.isin or (e.en_myinvestor and a.en_myinvestor))
  update fondos.fondo f set en_universo = (f.isin in (select isin from dentro))
  where f.en_universo is distinct from (f.isin in (select isin from dentro));

  select count(*) from (select fondos.asignar_indices()) x;

  select count(*)::int from fondos.fondo where en_universo;
$function$;
