-- Mineras de oro: el ETF de VanEck puede repartir dividendo (la serie es de precio); se cambia por uno de acumulación.
update fondos.indice set nombre = 'Mineras de oro (S&P Commodity Producers Gold)', proxy_isin = 'IE00B6R52036' -- iShares Gold Producers USD Acc (2011)
where id = 'mineras-oro';
