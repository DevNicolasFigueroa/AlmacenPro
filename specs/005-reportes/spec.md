# Spec 005 - Reportes y cierre de caja

**Estado:** implementada

## Contexto y objetivo

Hoy el almacén registra ventas, stock y fiado, pero el dueño todavía no puede responder con el sistema las preguntas de todos los días: **cuánto se vendió, cuánto se ganó, cuánto debería haber en caja y qué conviene comprar**. Esas cuentas se hacen de memoria o en un cuaderno, y los errores de caja (un vuelto mal dado, un abono sin anotar, plata que falta) se descubren tarde, cuando ya nadie recuerda qué pasó.

Este módulo entrega cuatro cosas: **ventas por período**, **ganancias**, **productos más vendidos y por reponer**, y el **cierre de caja de cada turno**. Los datos comerciales siguen siendo sagrados: todo se calcula desde las ventas, los abonos y las anulaciones ya registradas, el costo de cada producto queda congelado en cada venta para que la ganancia pasada nunca cambie, y un cierre de caja, una vez hecho, no se edita ni se borra.

Depende de la spec 001 (quién opera y qué le está permitido), de la spec 002 (productos, costos y stock), de la spec 003 (ventas, métodos de pago y anulaciones) y de la spec 004 (abonos y su método de pago, que alimentan el cierre de caja).

**Objetivo:** que el dueño sepa de un vistazo cuánto vende y cuánto gana, y que cada persona que atiende el mesón cierre su turno contando el efectivo, de modo que cualquier faltante o sobrante quede a la vista el mismo día.

## Cambios a especificaciones anteriores

Por decisión del dueño, cada persona que atiende el mesón cierra su propio turno de caja, incluidos los cajeros. Esta spec **cambia** estas reglas anteriores, que se actualizan en esas specs al implementar:

- **Spec 001, RF-12 y descripción del Cajero:** el Cajero sigue sin acceder a reportes, pero puede cerrar su propio turno de caja y ver el resultado de sus propios cierres. Sigue sin ver costos, márgenes, ventas por período, ganancias ni los cierres de otras personas.
- **Spec 003, "Fuera de alcance":** el cierre de caja y los reportes de ventas y de ganancias dejan de estar fuera de alcance y pasan a esta spec.
- **Spec 003 y constitución, principio 5:** además del precio, cada venta congela el **costo** de cada producto vendido al momento de confirmarse.
- **Spec 004, "Fuera de alcance":** lo cobrado por abonos y el cierre de caja pasan a esta spec.

## Usuarios / actores

**Administrador (dueño)**
- Ve todos los reportes: ventas por período, ganancias, productos más vendidos y por reponer.
- Ve los cierres de caja de todas las personas, con sus faltantes y sobrantes, y los turnos que quedaron sin cerrar.
- Cierra su propio turno cuando atiende el mesón.

**Cajero**
- Cierra su propio turno: declara el efectivo que contó en la caja y, al confirmar, ve su resultado.
- Ve el resultado de sus propios cierres.
- No ve costos, márgenes ni ganancias, ni ventas por período, ni productos más vendidos, ni los cierres de otras personas.

## Historias de usuario

- **HU-1.** Como Administrador, quiero ver cuánto vendí hoy o en un período, y con qué métodos me pagaron, para saber cómo va el negocio sin hacer cuentas a mano.
- **HU-2.** Como Administrador, quiero distinguir lo que vendí de lo que realmente cobré, para saber cuánto está en la calle y cuánto entró a caja.
- **HU-3.** Como Administrador, quiero ver cuánto gano por período y por producto, para saber qué me conviene vender y a qué precio.
- **HU-4.** Como Administrador, quiero ver los productos que más se venden y los que hay que reponer, para decidir qué comprar.
- **HU-5.** Como Cajero, quiero cerrar mi turno contando el efectivo de la caja, para dejar constancia de que mi caja cuadra o de cuánto faltó o sobró.
- **HU-6.** Como Administrador, quiero ver los cierres de caja de todas las personas y sus diferencias, para detectar errores de caja el mismo día.
- **HU-7.** Como Administrador, quiero saber qué turnos quedaron sin cerrar, para que nadie deje movimientos de plata sin revisar.
- **HU-8.** Como Administrador, quiero que el costo de cada venta quede guardado, para que mis ganancias pasadas no cambien cuando cambio un costo.

## Definiciones

- **Vendido:** suma de las ventas completadas, sea cual sea su método de pago, incluidas las del fiado. Las anuladas y canceladas no suman.
- **Cobrado:** dinero que efectivamente entró: ventas completadas pagadas en efectivo, débito o crédito, más los abonos registrados (efectivo, débito, crédito o transferencia). Una venta al fiado no es cobrado hasta que se abona.
- **Costo de una venta:** suma de lo que costó cada producto vendido, por su cantidad, con el costo que el producto tenía al confirmarse la venta.
- **Ganancia:** vendido menos costo, solo de las ventas completadas que tienen costo registrado.
- **Margen:** ganancia dividida por lo vendido, en porcentaje.
- **Turno:** lo que una persona vendió y cobró desde su cierre anterior hasta su cierre actual. Si nunca ha cerrado, desde su primera venta o abono.
- **Fondo inicial:** efectivo con el que la persona empezó el turno en la caja (el cambio inicial).
- **Efectivo esperado:** fondo inicial, más las ventas en efectivo del turno, más los abonos en efectivo del turno, menos el efectivo devuelto por anulaciones hechas en el turno.
- **Efectivo contado:** el efectivo que la persona cuenta físicamente en la caja al cerrar.
- **Diferencia:** efectivo contado menos efectivo esperado. Positiva es sobrante; negativa es faltante; cero, la caja cuadra.
- **Cierre de caja:** registro definitivo de un turno, con lo esperado, lo contado y la diferencia.
- **Turno sin cerrar:** persona que tiene ventas o abonos desde su último cierre y todavía no cierra.

## Requisitos funcionales (criterios de aceptación en EARS)

### Costo de las ventas

- **RF-1.** CUANDO se confirma una venta, EL SISTEMA debe guardar con cada producto vendido el costo que tenía en ese momento, y no cambiarlo después aunque cambie el costo del producto.
- **RF-2.** EL SISTEMA debe distinguir las ventas anteriores a este módulo, que no tienen costo registrado, de las que sí lo tienen, y no inventar un costo para las primeras.
- **RF-3.** EL SISTEMA debe impedir que el Cajero vea costos, márgenes o ganancias, en cualquier pantalla o respuesta, también por acceso directo.

### Ventas por período

- **RF-4.** CUANDO el Administrador consulta un período (hoy por defecto), EL SISTEMA debe mostrar lo vendido, la cantidad de ventas completadas, la venta promedio y el desglose de lo vendido por método de pago: efectivo, débito, crédito y fiado.
- **RF-5.** EL SISTEMA debe mostrar lo vendido por cajero y por día dentro del período.
- **RF-6.** EL SISTEMA no debe sumar al vendido las ventas anuladas ni canceladas, y debe informar aparte cuántas hubo de cada una y, en las anuladas, por cuánto.
- **RF-7.** EL SISTEMA debe mostrar aparte lo vendido al fiado y lo cobrado por abonos en el período, por método, para distinguir lo vendido de lo cobrado. Los abonos anulados no cuentan como cobrados.
- **RF-8.** EL SISTEMA debe pedir un período válido: fechas completas, "desde" no posterior a "hasta" y de hasta un año; si no lo es, debe indicar qué corregir.
- **RF-9.** EL SISTEMA debe contar cada venta en el día en que se confirmó, y una venta anulada después sigue contando como anulada en el día en que se vendió.

### Ganancias

- **RF-10.** CUANDO el Administrador consulta las ganancias de un período, EL SISTEMA debe mostrar lo vendido, el costo, la ganancia y el margen, solo de las ventas completadas que tienen costo registrado.
- **RF-11.** EL SISTEMA debe mostrar la ganancia por producto, de mayor a menor, con lo vendido, el costo, la ganancia y el margen de cada uno.
- **RF-12.** EL SISTEMA debe informar aparte cuántas ventas y cuánto vendieron las ventas sin costo registrado, y no incluirlas en la ganancia ni en el margen.
- **RF-13.** SI un producto vendido tiene costo $0, ENTONCES EL SISTEMA debe advertir que su ganancia puede estar sobrestimada.

### Productos más vendidos y por reponer

- **RF-14.** EL SISTEMA debe mostrar al Administrador los productos más vendidos del período, ordenados por monto vendido, con la cantidad vendida en su unidad (unidades o kilos) y el monto, incluidos los productos que después se desactivaron.
- **RF-15.** EL SISTEMA debe mostrar al Administrador los productos por reponer: primero los agotados y luego los de stock bajo, con su stock actual y su mínimo.

### Cierre de caja

- **RF-16.** EL SISTEMA debe permitir a cada persona que atiende el mesón, Cajero o Administrador, cerrar su propio turno.
- **RF-17.** CUANDO una persona cierra su turno, EL SISTEMA debe pedirle el fondo inicial (sugerido: el efectivo contado de su cierre anterior), el efectivo contado, ambos en pesos enteros de 0 o más, y una observación opcional de hasta 255 caracteres.
- **RF-18.** EL SISTEMA no debe mostrar al Cajero el efectivo esperado ni la diferencia hasta que haya declarado el efectivo contado y confirmado el cierre.
- **RF-19.** CUANDO se confirma el cierre, EL SISTEMA debe guardar en una sola operación, todo o nada: lo vendido en el turno por método (efectivo, débito, crédito y fiado), lo cobrado por abonos por método (efectivo, débito, crédito y transferencia), el efectivo devuelto por anulaciones hechas en el turno, el efectivo esperado, el efectivo contado y la diferencia, con quién cerró y cuándo.
- **RF-20.** EL SISTEMA debe mostrar al terminar el cierre el resultado de forma clara: "La caja cuadra", "Sobran $X" o "Faltan $X", con el resumen del turno.
- **RF-21.** SI la persona tiene una venta en curso, ENTONCES EL SISTEMA debe impedir el cierre y pedirle terminarla o cancelarla.
- **RF-22.** EL SISTEMA debe tratar el cierre como definitivo: no se edita ni se borra, y todo lo que se venda o cobre después pertenece al turno siguiente.
- **RF-23.** SI una venta o un abono en efectivo se anula después de que su turno ya se cerró, ENTONCES EL SISTEMA no debe cambiar ese cierre y debe descontar el efectivo devuelto en el turno de quien hizo la anulación.
- **RF-24.** SI se intenta cerrar dos veces el mismo turno a la vez, ENTONCES EL SISTEMA debe registrar un solo cierre.
- **RF-25.** EL SISTEMA debe permitir al Administrador consultar los cierres de todas las personas, por fecha y por persona, con los faltantes y sobrantes destacados, y abrir el detalle de cada cierre.
- **RF-26.** EL SISTEMA debe permitir al Cajero consultar solo sus propios cierres.
- **RF-27.** EL SISTEMA debe mostrar al Administrador los turnos sin cerrar: quién, desde cuándo y cuánto efectivo ha cobrado desde su último cierre.
- **RF-28.** EL SISTEMA debe impedir que el Cajero acceda a las ventas por período, las ganancias, los productos más vendidos y por reponer ni a los cierres de otras personas, también por acceso directo.

### Consistencia y trazabilidad

- **RF-29.** EL SISTEMA debe calcular las ventas, ganancias y rankings siempre desde las ventas, abonos y anulaciones registradas, y guardar cifras propias solo en los cierres de caja, que son la constancia de lo contado.
- **RF-30.** EL SISTEMA debe conservar cada cierre asociado a la cuenta que lo hizo, aunque esa cuenta se desactive después (spec 001, RF-23).

## Requisitos no funcionales

- **RNF-1.** Cerrar un turno, desde que la persona decide cerrar hasta ver su resultado, debe poder hacerse en menos de 2 minutos, sin salir de la pantalla de cierre.
- **RNF-2.** Cada reporte y la lista de cierres deben responder en menos de 2 segundos con hasta 50.000 ventas, 5.000 productos y 20.000 movimientos de fiado.
- **RNF-3.** Las cifras deben ser consistentes entre sí: el desglose por método suma el total, lo vendido por cajero y por día suma el total del período, y el efectivo esperado de un cierre se puede reconstruir con sus movimientos. Verificable con una mezcla de ventas, abonos y anulaciones.
- **RNF-4.** Ninguna falla ni cierre simultáneo debe dejar un cierre a medias o dos cierres del mismo turno.
- **RNF-5.** Los montos se muestran en formato CLP sin decimales (ej. $15.000), los márgenes en porcentaje entero y los kilos con hasta 3 decimales.
- **RNF-6.** Todos los textos y mensajes deben estar en español de Chile, sin jerga técnica, indicando qué hacer para corregir un problema.
- **RNF-7.** El cierre de caja debe poder usarse con teclado y con pantalla táctil, con la diferencia legible a distancia de mesón.
- **RNF-8.** Los costos, márgenes y ganancias no deben viajar ni aparecer en ninguna respuesta o pantalla del Cajero.

## Casos límite

- **Período sin ventas:** se muestra todo en cero y se indica que no hubo ventas, no un error.
- **Venta anulada después del cierre:** el cierre ya hecho no cambia; el efectivo devuelto se descuenta en el turno de quien anuló (RF-23).
- **Cierre sin movimientos:** se permite; lo esperado es el fondo inicial y la diferencia se calcula igual.
- **La caja no cuadra:** el cierre se guarda igual, con su faltante o sobrante visible para el Administrador; no se bloquea ni se corrige solo.
- **Ventas anteriores a este módulo:** no tienen costo; aparecen en el vendido y se informan aparte, sin entrar a la ganancia (RF-12).
- **Producto con costo $0:** su ganancia se advierte como posiblemente sobrestimada (RF-13).
- **Producto desactivado que se vendió:** sigue apareciendo en los rankings del período en que se vendió.
- **Cuenta desactivada con turno abierto:** no puede cerrar su turno; el Administrador lo ve como turno sin cerrar (RF-27).
- **Venta confirmada mientras otra persona cierra:** cada venta pertenece al turno de quien la confirmó, así que no se mezclan turnos distintos.
- **Primer cierre de una persona:** no tiene cierre anterior, así que el fondo inicial no tiene sugerencia y lo escribe ella.
- **Efectivo contado o fondo inicial con decimales, negativos o texto:** se rechaza indicando que debe ser un monto en pesos enteros de 0 o más.
- **Venta al fiado:** suma al vendido pero no al efectivo esperado hasta que se abona.

## Fuera de alcance

- Exportar o imprimir reportes y cierres: por ahora solo se ven en pantalla.
- Gráficos y comparaciones entre períodos.
- Reportes programados o enviados por correo, WhatsApp o SMS.
- Valorización del inventario e índices de rotación (spec 002).
- Reporte de antigüedad de la deuda y cobranza detallada: el total por cobrar y el listado de deudores ya existen (spec 004).
- Gastos, compras a proveedores y ganancia neta: la ganancia es ventas menos costo de los productos.
- Impuestos, IVA y boletas electrónicas.
- Retiros de dinero de la caja, gastos de caja y conteo por denominación de billetes.
- Cerrar el turno de otra persona o corregir un cierre ya hecho.
- Varias cajas o sucursales.
- Pantalla de inicio con resumen del día.

## Criterios de finalización

- [x] Cada venta confirmada guarda el costo de sus productos en ese momento, y cambiar el costo de un producto después no cambia la ganancia de ventas pasadas.
- [x] El Administrador ve lo vendido, la cantidad de ventas, la venta promedio y el desglose por método, por cajero y por día de cualquier período, sin sumar anuladas ni canceladas.
- [x] Lo vendido al fiado y lo cobrado por abonos se muestran aparte, y los abonos anulados no cuentan como cobrados.
- [x] El Administrador ve ventas, costo, ganancia y margen del período y por producto; las ventas sin costo registrado se informan aparte y no entran al cálculo.
- [x] Los productos más vendidos y los productos por reponer se ven con sus cantidades y montos.
- [x] Cada persona cierra su turno declarando fondo inicial y efectivo contado, y ve su resultado (cuadra, sobra o falta) solo después de confirmar.
- [x] El efectivo esperado se calcula con el fondo inicial, las ventas en efectivo, los abonos en efectivo y las devoluciones por anulaciones del turno.
- [x] Un cierre no se puede editar ni borrar, y no se puede cerrar con una venta en curso ni dos veces el mismo turno.
- [x] Una anulación posterior no cambia un cierre hecho y se descuenta en el turno de quien la hizo.
- [x] El Administrador ve los cierres de todos con sus faltantes y sobrantes destacados, y los turnos sin cerrar.
- [x] El Cajero solo ve sus propios cierres, y no ve costos, márgenes, ganancias ni reportes, ni por pantalla ni por acceso directo.
- [x] Las cifras de todos los reportes y cierres son consistentes entre sí tras cualquier mezcla de ventas, abonos y anulaciones.
- [x] Con 50.000 ventas y 5.000 productos, cada reporte y la lista de cierres responden en menos de 2 segundos.
- [x] Todos los montos están en CLP sin decimales y todos los textos en español.

## Dudas abiertas

Ninguna pendiente. Las tres dudas se resolvieron al aprobar, con la propuesta de la redacción:

- El efectivo devuelto por una anulación se descuenta en el turno de quien hace la anulación, porque es de su caja de donde sale el dinero devuelto (RF-23).
- El fondo inicial se declara al cerrar el turno, sugerido con el efectivo contado del cierre anterior (RF-17), sin una apertura de turno obligatoria que agregue un paso al mesón.
- El Cajero cuenta "a ciegas": no ve el efectivo esperado hasta declarar lo contado (RF-18), para que el conteo sea honesto.

### Decisiones tomadas en la redacción

- **Vendido y cobrado son cosas distintas.** Una venta al fiado suma al vendido, pero entra a caja recién cuando se abona; por eso se muestran aparte (RF-7).
- **La ganancia es solo de ventas con costo registrado.** Inventar el costo de ventas antiguas con el costo de hoy daría ganancias falsas; esas ventas se informan aparte (RF-12).
- **Los rankings se ordenan por monto vendido.** Hay productos por unidad y por kilo, así que ordenar por cantidad mezclaría unidades distintas.
- **Cada persona cierra su propio turno,** incluido el Administrador cuando atiende el mesón: es lo que permite saber de quién fue un faltante.
- **El cierre se guarda siempre,** aunque no cuadre: lo importante es dejar la diferencia a la vista, no impedir el cierre.
- **Solo en pantalla.** Imprimir y exportar quedan para después.
- **El período máximo es un año,** para mantener las consultas rápidas con muchas ventas.
