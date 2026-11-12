-- Las series semanales guardan también el último dato de cada mes. Las cargadas antes se recargan una vez.
alter table fondos.fondo add column con_cierres_mes boolean not null default false;
