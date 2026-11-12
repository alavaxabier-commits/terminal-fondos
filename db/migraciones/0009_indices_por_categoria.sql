-- Índice de referencia de cada categoría (especificación, sección 3).
-- Categorías grandes y claras → un índice de mercado, representado por un fondo indexado barato y con historia.
-- Nichos (sectores, alternativos, high yield, materias primas…) → la media de su categoría, si tiene 5 fondos o más.
-- Un fondo puede tener su propio índice (fondo.indice_id), que manda sobre el de su categoría.

-- Sustitutos de cada índice (clase de acumulación en EUR, la más antigua y barata disponible)
update fondos.indice set proxy_isin = 'IE00B03HCZ61' where id = 'msci-world';     -- Vanguard Global Stock Index (2000)
update fondos.indice set proxy_isin = 'IE0032620787' where id = 'sp500';          -- Vanguard US 500 Stock Index (2003)
update fondos.indice set proxy_isin = 'IE0007987690' where id = 'msci-europe';    -- Vanguard European Stock Index (1999)
update fondos.indice set proxy_isin = 'IE0031786142' where id = 'msci-em';        -- Vanguard Emerging Markets Stock Index (2006)
update fondos.indice set proxy_isin = 'IE00B18GC888' where id = 'bbg-global-agg'; -- Vanguard Global Bond Index EUR Hedged (2014)
update fondos.indice set proxy_isin = 'LU1479964204' where id = 'bbg-euro-agg';   -- UBS BBG EUR Aggregate Bond Index (2016)
update fondos.indice set nombre = 'Mixto 60/40 (MSCI World / Global Aggregate EUR cubierto)' where id = 'mixto-60-40';

insert into fondos.indice (id, nombre, proxy_isin, componentes) values
  ('msci-emu',          'MSCI EMU',                          'IE0008248795', null), -- Vanguard Eurozone Stock Index (2010)
  ('msci-japan',        'MSCI Japan',                        'IE0007281425', null), -- Vanguard Japan Stock Index (2008)
  ('msci-pacific-xj',   'MSCI Pacific ex Japan',             'IE00B8J31D58', null), -- iShares Pacific Index (2013)
  ('euro-govt',         'Bloomberg Euro Treasury',           'LU1542322224', null), -- Cleome Index Euro Govt Bonds (2017)
  ('euro-corp',         'Bloomberg Euro Corporate',          'LU1542321259', null), -- Cleome Index Euro Corp Bonds (2017)
  ('global-govt',       'Global Treasury (EUR cubierto)',    'LU0956451354', null), -- State Street Global Treasury Index (2013)
  ('mixto-30-70',       'Mixto 30/70 (prudente)',            null, '[{"id": "msci-world", "peso": 0.3}, {"id": "bbg-global-agg", "peso": 0.7}]'),
  ('mixto-50-50',       'Mixto 50/50 (moderado)',            null, '[{"id": "msci-world", "peso": 0.5}, {"id": "bbg-global-agg", "peso": 0.5}]'),
  ('mixto-80-20',       'Mixto 80/20 (agresivo)',            null, '[{"id": "msci-world", "peso": 0.8}, {"id": "bbg-global-agg", "peso": 0.2}]');

-- Reglas por nombre de categoría de Morningstar (la primera que encaja, por orden)
create table fondos.regla_indice (
  orden     int primary key,
  patron    text not null,              -- expresión regular sobre el nombre de la categoría
  indice_id text not null references fondos.indice(id)
);
insert into fondos.regla_indice (orden, patron, indice_id) values
  (10, '^Global Large-Cap (Blend|Growth|Value) Equity$|^Global Flex-Cap Equity$|^Global Equity Income$', 'msci-world'),
  (20, '^US Large-Cap (Blend|Growth|Value) Equity$|^US Flex-Cap Equity$|^US Equity Income$',             'sp500'),
  (30, '^Europe Large-Cap (Blend|Growth|Value) Equity$|^Europe Flex-Cap Equity$|^Europe Equity Income$|^Europe ex-UK Equity$', 'msci-europe'),
  (40, '^Eurozone (Large-Cap|Flex-Cap) Equity$',                                                          'msci-emu'),
  (50, '^Global Emerging Markets (ex-China )?Equity$',                                                    'msci-em'),
  (60, '^Japan (Large-Cap (Blend|Growth|Value)|Flex-Cap) Equity$',                                        'msci-japan'),
  (70, '^Pacific ex-Japan Equity$',                                                                       'msci-pacific-xj'),
  (80, '^EUR (Diversified|Flexible) Bond$|^EUR Bond - Long Term$',                                        'bbg-euro-agg'),
  (90, '^EUR Government Bond$',                                                                           'euro-govt'),
  (100, '^EUR Corporate Bond$',                                                                           'euro-corp'),
  (110, '^Global (Diversified|Flexible) Bond - EUR Hedged$',                                              'bbg-global-agg'),
  (120, '^Global Government Bond - EUR Hedged$',                                                          'global-govt'),
  (130, '^EUR Money Market|^EUR Ultra Short-Term Bond$',                                                  'estr'),
  (140, '^EUR Cautious Allocation',                                                                       'mixto-30-70'),
  (150, '^EUR Moderate Allocation',                                                                       'mixto-50-50'),
  (160, '^EUR Aggressive Allocation',                                                                     'mixto-80-20'),
  (170, '^EUR Flexible Allocation',                                                                       'mixto-60-40');

-- Referencia de cada categoría del universo: índice de mercado, media de la categoría o ninguna
create view fondos.categoria_referencia with (security_invoker = true) as
  with c as (
    select categoria, count(*) filter (where en_universo) as fondos
    from fondos.fondo where categoria is not null group by categoria)
  select c.categoria, c.fondos,
         r.indice_id,
         case when r.indice_id is not null then 'indice'
              when c.fondos >= 5 then 'media_categoria'
              else 'ninguna' end as metodo
  from c
  left join lateral (
    select indice_id from fondos.regla_indice where c.categoria ~ patron order by orden limit 1) r on true;

-- Los sustitutos de los índices se descargan a diario, aunque no estén en el universo
create or replace view fondos.fondo_diario with (security_invoker = true) as
  select cf.isin from fondos.cartera_fondo cf join fondos.cartera c on c.id = cf.cartera_id where not c.archivada
  union select isin from fondos.seguimiento where estado <> 'descartado'
  union select proxy_isin from fondos.indice where proxy_isin is not null;

alter table fondos.regla_indice enable row level security;
revoke all on fondos.regla_indice from anon, authenticated;
