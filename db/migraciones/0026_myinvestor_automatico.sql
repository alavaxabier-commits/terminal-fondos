-- Disponibilidad en MyInvestor: ya no se marca a mano; sale del catálogo (fondos.myinvestor, abierto).
alter table fondos.seguimiento drop column disponible_myinvestor;
