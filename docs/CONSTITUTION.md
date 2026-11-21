# Constitución de AlmacenPro

Los 6 principios siguientes son innegociables. Cada cambio debe poder verificarse contra ellos.

1. **Simplicidad y fidelidad al stack.** React + TypeScript, Node/Express, MySQL, JWT. Sin nuevas librerías
   ni abstracciones sin necesidad demostrada. Verificable: `package.json` solo contiene lo listado en el README.

2. **La especificación manda.** Todo módulo nace de su especificación; el código que contradice la spec se
   corrige o se actualiza la spec antes de mergear. Verificable: cada endpoint tiene una spec o ticket asociado.

3. **Capas separadas y datos atómicos.** Ruta → controlador → modelo, sin saltos ni SQL en controladores.
   Ventas, stock y fiado se escriben en UNA transacción SQL: o todo o nada. Verificable: revisión de código +
   rollback ante fallo de stock en una venta de prueba.

4. **No se avanza con errores ni flujos rotos.** Cada funcionalidad se valida manual o automáticamente antes
   de pasar a la siguiente. Verificable: sin `TODO` bloqueantes ni endpoints que retornen 501 en código nuevo
   que dependa de ellos.

5. **Los datos comerciales son sagrados.** El stock nunca queda negativo, el precio del detalle de venta queda
   congelado al momento de la venta, y toda deuda de fiado queda registrada en `fiado_transacciones` (cargo, abono o anulación).
   Verificable: `stock >= 0` en toda ejecución y conciliación: suma de cargos − abonos − anulaciones = saldo en `v_saldo_fiado`.

6. **100% en español, contexto chileno.** Código (identificadores), comentarios, mensajes de error e interfaz
   en español; montos en formato CLP y RUT chileno. Verificable: revisión de diff sin texto en inglés visible
   al usuario ni decimales en precios.
