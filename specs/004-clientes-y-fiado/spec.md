# Spec 004 - Clientes y fiado

**Estado:** implementada

## Contexto y objetivo

La spec 003 permite vender al fiado y dejó el cargo registrado en la cuenta del cliente, pero el almacén todavía no puede **cobrar** esa deuda dentro del sistema: no hay abonos, el cliente solo existe con su RUT (si se escribió mal no se puede corregir), no hay un listado de clientes y quien atiende el mesón no puede ver qué le debe a quién. En un almacén de barrio el fiado es conversación cara a cara: el cliente llega, dice cuánto trae, y quien atiende necesita ver su cuenta y anotar el pago en el momento.

Este módulo cierra el ciclo del fiado: **registrar los abonos**, **ver la cuenta completa de cada cliente** (compras, fiados, abonos y saldo), **buscar clientes** en un listado y **mantener sus datos** (nombre, contacto y RUT). Los datos comerciales siguen siendo sagrados: toda deuda y todo pago quedan registrados, nada se borra ni se edita, y el saldo siempre se puede reconstruir sumando los movimientos.

Depende de la spec 001 (cuentas, roles y la protección de la venta en curso), de la spec 002 (convención de movimientos que solo se insertan) y de la spec 003 (clientes identificados por RUT, ventas al fiado y su anulación).

**Objetivo:** que quien atiende el mesón, sea Cajero o Administrador, vea de un vistazo si un cliente es deudor, registre su abono en menos de 20 segundos y mantenga al día los datos del cliente, sin depender del dueño para cada gestión.

## Cambios a especificaciones anteriores

Por decisión del dueño, el Cajero es quien conversa con el cliente y debe poder conocer y mover su cuenta. Esta spec **reemplaza** estas reglas anteriores, que se actualizan en esas specs al implementar:

- **Spec 001, RF-12:** el Cajero deja de tener vedado "el listado completo de deudas de fiado". Sigue sin acceder a reportes, historial de ventas, gestión de cuentas, anulación de ventas, costos ni márgenes.
- **Spec 001, RF-13:** el Cajero deja de estar limitado a consultar el saldo sin modificarlo; ahora también registra abonos. Lo que la spec 003 ya mostró del saldo se amplía en esta spec.
- **Spec 003, RF-19:** el Cajero deja de tener prohibido registrar abonos: los registra desde la cuenta del cliente, que puede abrir desde la pantalla de venta (RF-8). El cobro de la venta en sí sigue sin registrar abonos.
- **Spec 003, RF-23 y RF-24:** la cuenta completa del cliente deja de ser solo del Administrador: la ven el Cajero y el Administrador.
- **Spec 003, RF-38:** el detalle de una venta completada o anulada deja de ser solo del Administrador cuando se abre desde la cuenta de un cliente: el Cajero también lo ve, pero solo de las compras de ese cliente. El detalle de ventas canceladas (RF-39) y el historial general (RF-40) siguen siendo del Administrador.
- **Spec 003, secciones "Usuarios / actores", "Fuera de alcance" y "Criterios de finalización":** el Cajero ahora sí ve la cuenta completa de los clientes; editar clientes, corregir un RUT y registrar abonos dejan de estar pendientes y pasan a esta spec. Desactivar clientes queda fuera de ambas.
- **Constitución, principio 5:** la conciliación pasa a ser cargos − abonos − anulaciones de venta + anulaciones de abono = saldo de la cuenta del cliente.

## Usuarios / actores

**Cajero**
- Busca clientes en el listado, ve su cuenta completa (compras con su detalle, fiados, abonos y saldo) y conoce de inmediato si es deudor.
- Registra abonos al fiado.
- Agrega o edita el nombre y los datos de contacto de un cliente y corrige su RUT.
- No anula abonos ni ventas, no ve el historial general de ventas ni las ventas de otras personas, reportes, costos ni márgenes, y no ve el total por cobrar del negocio ni el historial de cambios de RUT.

**Administrador (dueño)**
- Todo lo que hace el Cajero.
- Anula abonos mal registrados, con motivo.
- Ve el total por cobrar del negocio y el historial de cambios de RUT de cada cliente.

## Historias de usuario

- **HU-1.** Como Cajero, quiero ver la cuenta de un cliente (compras con su detalle, fiados, abonos y saldo) para saber si es una persona deudora y qué ha movido antes de atenderla.
- **HU-2.** Como Cajero, quiero registrar el abono que me entrega el cliente en el momento, para que su deuda baje y no dependa de que lo anote el dueño.
- **HU-3.** Como Cajero, quiero buscar un cliente por RUT o por nombre para encontrar su cuenta sin tener que recordar su RUT completo.
- **HU-4.** Como Cajero, quiero ver el listado de clientes que están en deuda para saber quiénes deben y cuánto.
- **HU-5.** Como Cajero, quiero agregar el nombre y el contacto de un cliente para reconocerlo y poder ubicarlo si no paga.
- **HU-6.** Como Cajero, quiero corregir un RUT mal escrito para que las compras y la deuda queden con la persona correcta.
- **HU-7.** Como Administrador, quiero anular un abono mal registrado con un motivo para corregir el error sin borrar nada y dejar constancia.
- **HU-8.** Como Administrador, quiero saber cuánto me deben en total para tener claro cuánto dinero tengo en la calle.
- **HU-9.** Como Administrador, quiero que cada cambio de RUT quede registrado para poder revisar quién corrigió qué.

## Definiciones

- **Cuenta del cliente:** registro de un cliente con su saldo, sus compras y sus movimientos de fiado.
- **Movimiento de fiado:** cada registro de la cuenta: cargo (venta al fiado), abono (pago), anulación de venta fiada y anulación de abono. Solo se agregan; nunca se editan ni se borran.
- **Abono:** pago que el cliente hace para bajar su deuda. Es general: se descuenta del saldo total y no se asigna a una venta en particular.
- **Abono anulado:** abono que el Administrador dejó sin efecto por estar mal registrado. Sigue visible, marcado como anulado, y su monto vuelve a sumarse a la deuda.
- **Saldo:** cargos, menos abonos, menos anulaciones de venta, más anulaciones de abono. Positivo es deuda; cero, al día; negativo, saldo a favor.
- **En deuda / Al día / A favor:** estado del cliente según el signo de su saldo.
- **Total por cobrar:** suma de las deudas de todos los clientes que están en deuda. No se compensa con los saldos a favor.
- **Método del abono:** cómo pagó el cliente: efectivo, débito, crédito o transferencia. Solo se anota; no se conecta con ningún terminal de pago.

## Requisitos funcionales (criterios de aceptación en EARS)

### Listado y búsqueda de clientes

- **RF-1.** EL SISTEMA debe permitir al Cajero y al Administrador consultar el listado de clientes con RUT formateado, nombre (o "Sin nombre"), saldo y estado (en deuda, al día o a favor).
- **RF-2.** CUANDO se escribe en el buscador, EL SISTEMA debe encontrar clientes por RUT, con o sin puntos y guion y también de forma parcial, o por nombre, de forma parcial y sin distinguir mayúsculas ni tildes.
- **RF-3.** EL SISTEMA debe permitir filtrar el listado por estado: todos, en deuda, a favor y al día.
- **RF-4.** EL SISTEMA debe ordenar el listado por nombre y, si no lo tiene, por RUT; y, cuando se filtra por clientes en deuda, de la mayor a la menor deuda.
- **RF-5.** EL SISTEMA debe destacar visualmente a los clientes en deuda y mostrar su monto, en el listado y en su cuenta.
- **RF-6.** EL SISTEMA debe mostrar al Administrador, junto al listado, la cantidad de clientes en deuda y el total por cobrar, y no mostrarlos al Cajero.

### Cuenta del cliente

- **RF-7.** CUANDO el Cajero o el Administrador abre un cliente, EL SISTEMA debe mostrar su cuenta: RUT formateado, nombre, contacto, saldo con su estado, sus compras (ventas completadas y anuladas asociadas a su RUT, con fecha, total, método y estado) y sus movimientos de fiado (con fecha, tipo, monto, quién lo registró y observación o motivo), de lo más reciente a lo más antiguo. Al abrir una compra, EL SISTEMA debe mostrar su detalle: productos, cantidades, precios al momento de vender, subtotales, total, método de pago, cajero y, si fue anulada, quién la anuló, cuándo y por qué.
- **RF-8.** EL SISTEMA debe permitir abrir la cuenta del cliente que se está atendiendo desde la pantalla de venta, sin perder el carrito ni la venta en curso.
- **RF-9.** EL SISTEMA debe impedir que el Cajero acceda al historial general de ventas, a los reportes y al detalle de ventas que no pertenezcan al cliente cuya cuenta está viendo (spec 001, RF-12), también por acceso directo; del detalle de una compra del cliente no ve costos ni márgenes y no puede anularla.

### Abonos

- **RF-10.** CUANDO el Cajero o el Administrador registra un abono, EL SISTEMA debe exigir un cliente registrado, un monto en pesos enteros mayor que 0 y el método del abono (efectivo, débito, crédito o transferencia), y permitir una observación opcional de hasta 255 caracteres.
- **RF-11.** ANTES de confirmar el abono, EL SISTEMA debe mostrar el saldo actual del cliente y el saldo que quedará.
- **RF-12.** SI el monto del abono supera la deuda del cliente, ENTONCES EL SISTEMA debe avisar cuánto quedará a favor del cliente y pedir una confirmación explícita antes de registrarlo.
- **RF-13.** CUANDO se confirma el abono, EL SISTEMA debe registrarlo en una sola operación todo o nada, con fecha y hora y la cuenta que lo registró, y mostrar de inmediato el saldo actualizado y un resumen con el monto, el método y el saldo resultante.
- **RF-14.** SI falla el registro de un abono, ENTONCES EL SISTEMA debe informarlo en español y dejar la cuenta del cliente exactamente como estaba.
- **RF-15.** EL SISTEMA debe impedir modificar o eliminar un abono ya registrado; la única corrección posible es anularlo.

### Anular un abono

- **RF-16.** CUANDO el Administrador anula un abono, EL SISTEMA debe exigir un motivo escrito de hasta 255 caracteres, dejar constancia de quién, cuándo y por qué, y sumar el monto del abono de nuevo a la deuda.
- **RF-17.** SI el abono ya está anulado, ENTONCES EL SISTEMA debe impedir anularlo de nuevo.
- **RF-18.** EL SISTEMA debe permitir anular un abono sin límite de tiempo y mantenerlo visible en la cuenta del cliente, marcado como anulado.
- **RF-19.** EL SISTEMA debe impedir que el Cajero anule abonos, ni por pantalla ni por acceso directo.

### Datos del cliente

- **RF-20.** EL SISTEMA debe permitir al Cajero y al Administrador agregar o editar el nombre (hasta 150 caracteres), el teléfono (hasta 20, solo dígitos, espacios, +, - y paréntesis), el correo electrónico (con formato válido, hasta 120) y la dirección (hasta 200) de un cliente, todos opcionales; y borrar un dato dejando el campo vacío.
- **RF-21.** CUANDO el Cajero o el Administrador corrige el RUT de un cliente, EL SISTEMA debe exigir un RUT chileno válido con su dígito verificador, según la spec 003, RF-20.
- **RF-22.** SI el RUT nuevo ya pertenece a otro cliente, ENTONCES EL SISTEMA debe impedir el cambio, indicar quién es ese cliente y no fusionar cuentas.
- **RF-23.** ANTES de guardar un cambio de RUT, EL SISTEMA debe advertir que todas las compras, los fiados y el saldo del cliente pasan al RUT nuevo, y pedir una confirmación explícita.
- **RF-24.** CUANDO se cambia el RUT de un cliente, EL SISTEMA debe conservar intactos sus compras, sus movimientos de fiado y su saldo, y dejar constancia del cambio: RUT anterior, RUT nuevo, quién y cuándo, sin límite de tiempo y sin poder alterarse ni borrarse.
- **RF-25.** EL SISTEMA debe mostrar al Administrador el historial de cambios de RUT de cada cliente, y no mostrarlo al Cajero.

### Saldo y trazabilidad

- **RF-26.** EL SISTEMA debe calcular el saldo de cada cliente siempre a partir de sus movimientos, como cargos, menos abonos, menos anulaciones de venta, más anulaciones de abono, de modo que siempre pueda reconstruirse y nunca quede un saldo que no coincida con ellos.
- **RF-27.** EL SISTEMA debe conservar cada abono y cada anulación asociados a la cuenta que los registró, aunque esa cuenta se desactive después (spec 001, RF-23).

## Requisitos no funcionales

- **RNF-1.** Registrar un abono, desde que se tiene el RUT del cliente hasta ver el saldo actualizado, debe poder hacerse en menos de 20 segundos y sin salir de la cuenta del cliente.
- **RNF-2.** Buscar clientes, abrir una cuenta y registrar un abono deben responder en menos de 2 segundos, con hasta 5.000 clientes, 50.000 ventas y 20.000 movimientos de fiado. El listado no debe cargar los 5.000 clientes de una vez.
- **RNF-3.** Ninguna falla ni registro simultáneo debe dejar un abono sin cliente, un movimiento a medias o un saldo que no cuadre. Verificable: la conciliación del principio 5 de la constitución se cumple para cada cliente.
- **RNF-4.** Los montos deben mostrarse en formato CLP sin decimales (ej. $15.000) y el RUT con el formato chileno (ej. 12.345.678-5).
- **RNF-5.** Todos los textos y mensajes deben estar en español de Chile, sin jerga técnica, indicando qué debe hacer la persona para corregir el problema.
- **RNF-6.** La cuenta del cliente debe poder usarse con teclado y con pantalla táctil, con el saldo y el aviso de deuda legibles a distancia de mesón.
- **RNF-7.** Todo abono, anulación de abono y cambio de RUT debe conservar quién, cuándo y su referencia, sin límite de tiempo, y no puede alterarse ni borrarse desde la interfaz.
- **RNF-8.** El costo y el margen no deben viajar ni aparecer en ninguna respuesta o pantalla del Cajero (spec 003, RNF-9).

## Casos límite

- **Cliente sin nombre ni contacto:** se muestra y se busca por su RUT; donde corresponda aparece "Sin nombre".
- **Abono mayor que la deuda:** se avisa cuánto quedará a favor y se registra solo con confirmación; el saldo a favor se descuenta de futuras ventas fiadas porque el saldo es un solo número.
- **Abono a un cliente al día o con saldo a favor:** se permite, con el mismo aviso de que quedará a favor.
- **Doble clic o doble envío al registrar un abono:** la interfaz deshabilita el botón mientras se envía, para registrar uno solo; si igualmente quedaran dos abonos iguales, el Administrador anula el sobrante.
- **Abono anulado:** su monto vuelve a la deuda; el abono sigue en la cuenta marcado como anulado y no puede anularse otra vez.
- **Anular una venta fiada cuyo cliente ya abonó:** se mantiene la regla de la spec 003 (RF-44): puede quedar saldo a favor.
- **RUT corregido a uno ya registrado:** se impide, se indica el cliente existente y no se fusionan cuentas.
- **RUT corregido con una venta en curso de ese cliente:** la venta continúa asociada al mismo cliente; ya no depende de cómo se escriba el RUT.
- **RUT mal escrito pero válido que pertenece a otra persona:** se corrige cambiando el RUT del cliente equivocado y registrando la compra al correcto; fusionar cuentas queda fuera de alcance.
- **Cajero desactivado con una venta en curso:** solo puede terminarla o cancelarla (spec 001); no registra abonos ni edita clientes.
- **Dos personas editando al mismo cliente:** vale el último cambio guardado; el cambio de RUT queda siempre registrado.
- **Búsqueda sin resultados:** se indica que no hay coincidencias y se ofrece registrar al cliente solo con su RUT cuando lo escrito es un RUT válido.

## Fuera de alcance

- Límite de crédito del fiado, avisos al superar un tope o bloqueo de ventas: el fiado sigue sin límite y solo destaca la deuda.
- Desactivar, eliminar o fusionar clientes.
- Recordatorios y cobranza: mensajes por WhatsApp, SMS o correo, y llamadas.
- Intereses, recargos por mora, plazos de pago y fechas de vencimiento de la deuda.
- Abonos asignados a una venta específica: el abono siempre es general.
- Devolver dinero al cliente cuando queda saldo a favor.
- Conectar el método del abono con terminales o pasarelas de pago.
- Estado de cuenta imprimible o exportable y comprobante de abono impreso.
- Importar clientes desde archivos.
- Más de un teléfono, correo o dirección por cliente.
- Reportes de cobranza, de lo cobrado en el día y cierre de caja: pertenecen a la spec de reportes.
- Listado de clientes inactivos o sin compras recientes.

## Criterios de finalización

- [x] El Cajero y el Administrador abren la cuenta de un cliente y ven sus compras, sus movimientos de fiado, su saldo y si es deudor.
- [x] El Cajero abre el detalle de cada compra de un cliente (productos, cantidades, precios y subtotales), sin costos ni márgenes, y no puede abrir el de una venta que no sea de ese cliente ni anularla, ni por pantalla ni por acceso directo.
- [x] El listado de clientes se busca por RUT (con o sin puntos, completo o parcial) y por nombre, y se filtra por estado; con el filtro "en deuda" se ordena de mayor a menor deuda.
- [x] El Cajero registra un abono con monto y método, ve el saldo antes y después, y la deuda baja de inmediato.
- [x] Un abono mayor que la deuda avisa cuánto quedará a favor y exige confirmación.
- [x] Un abono registrado no se puede editar ni borrar; el Administrador lo anula con motivo y el monto vuelve a la deuda.
- [x] El Cajero no puede anular un abono, ni por pantalla ni por acceso directo.
- [x] La conciliación cargos − abonos − anulaciones de venta + anulaciones de abono = saldo se cumple para cada cliente tras cualquier combinación de ventas, abonos y anulaciones.
- [x] Si falla el registro de un abono, la cuenta queda exactamente como estaba.
- [x] El Cajero y el Administrador agregan o editan nombre, teléfono, correo y dirección de un cliente.
- [x] Un cambio de RUT válido conserva compras, fiados y saldo del cliente, pide confirmación y deja constancia de quién y cuándo.
- [x] Un RUT inválido se rechaza, y un RUT que ya pertenece a otro cliente se rechaza indicando quién es.
- [x] El Administrador ve el total por cobrar y el historial de cambios de RUT; el Cajero no los ve.
- [x] Desde la pantalla de venta se abre la cuenta del cliente sin perder el carrito.
- [x] Con 5.000 clientes, buscar, abrir una cuenta y registrar un abono responden en menos de 2 segundos.
- [x] Todos los montos están en CLP sin decimales y todos los textos en español.

## Dudas abiertas

Ninguna pendiente. La única duda, si el Cajero puede anular un abono, se resolvió al aprobar: solo el Administrador (RF-16 y RF-19), porque quien recibe el dinero no debería poder deshacer el registro de ese mismo pago sin que otra persona lo revise.

### Decisiones tomadas en la redacción

- **Abonos generales.** Un abono baja el saldo total y no se asigna a una venta: el saldo es un solo número y así se cobra en la práctica.
- **Cajero con acceso amplio al cliente.** Por decisión del dueño, el Cajero ve la cuenta completa (incluido el detalle de cada compra del cliente, para conocer cada movimiento), el listado, registra abonos, edita datos y corrige el RUT. Lo que se mantiene reservado al Administrador es anular (abonos y ventas), el total por cobrar y el historial de cambios de RUT.
- **Cambio de RUT sin motivo obligatorio.** Para no frenar la atención, no se exige motivo; a cambio queda constancia inalterable de RUT anterior, RUT nuevo, quién y cuándo, visible para el Administrador (RF-24 y RF-25), y se pide confirmación explícita (RF-23).
- **Sin fusión de cuentas.** Si el RUT nuevo ya existe, se impide el cambio en lugar de unir dos clientes, porque fusionar mezclaría deudas y compras sin posibilidad de deshacerlo.
- **Abono mayor que la deuda.** Se permite con confirmación y deja saldo a favor, igual que al anular una venta fiada con abonos en la spec 003.
- **Método del abono.** Se registra (efectivo, débito, crédito o transferencia) para que el cierre de caja de la spec de reportes sepa cuánto efectivo entró por abonos. No se conecta con terminales.
- **Total por cobrar solo para el Administrador.** Es una cifra financiera del negocio; el Cajero ve la deuda de cada cliente, no el total.
- **Búsqueda sin resultados.** Ofrece registrar al cliente solo cuando lo escrito es un RUT válido, para no crear clientes con datos incompletos.
