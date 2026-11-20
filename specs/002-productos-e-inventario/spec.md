# Spec 002 - Productos e inventario

**Estado:** implementada

## Contexto y objetivo

El almacén vive de saber qué vende, a qué precio y cuánto le queda. Hoy el dueño lleva eso de memoria o en cuadernos: se entera de que se acabó el pan cuando el cliente lo pide, vende algo a un precio desactualizado o no sabe por qué el conteo de la bodega no calza con lo que dice el sistema. Además, el punto de venta no puede registrar nada sin un catálogo confiable.

Este módulo resuelve tres problemas: **mantener el catálogo de productos con sus precios**, **saber cuánto stock hay de cada uno** y **enterarse a tiempo de lo que hay que reponer**, dejando constancia de cada vez que el stock se corrige a mano (por qué, quién y cuándo). Los datos comerciales son sagrados: el stock nunca queda negativo y toda corrección deja huella.

Depende de la spec 001 (quién opera y qué le está permitido) y es base de la spec de ventas, que descontará el stock al vender. El descuento por venta queda fuera de esta spec.

**Objetivo:** que el administrador cree un producto en menos de 1 minuto, corrija el stock en menos de 30 segundos y que cualquier persona del mesón vea de un vistazo qué se está acabando.

## Usuarios / actores

**Administrador (dueño)**
- Crea, edita, desactiva y reactiva productos; ve costos y márgenes; define el stock mínimo; hace ajustes manuales de stock; consulta el historial de ajustes.

**Cajero**
- Consulta el listado de productos y el stock, viendo solo nombre, categoría, precio de venta, existencias y la marca de stock bajo o agotado; también ve los productos desactivados marcados como "No disponible", sin poder venderlos.
- Ve el resumen con la cantidad de productos con stock bajo y agotados.
- No ve costos ni márgenes, no crea ni modifica productos, no ajusta stock y no ve el historial de ajustes (spec 001, RF-11 y RF-12).

## Historias de usuario

- **HU-1.** Como Administrador quiero crear un producto con su nombre, precio, costo y categoría para tener el catálogo listo para vender.
- **HU-2.** Como Administrador quiero editar los datos de un producto para mantener precios y datos al día.
- **HU-3.** Como Administrador quiero desactivar un producto que ya no vendo para que deje de aparecer en la venta sin perder su historial.
- **HU-4.** Como Administrador quiero reactivar un producto desactivado para volver a venderlo sin crearlo de nuevo.
- **HU-5.** Como Administrador quiero ajustar el stock indicando el motivo (merma, reposición o corrección) para que lo que dice el sistema calce con lo que hay en bodega y quede registrado por qué cambió.
- **HU-6.** Como Administrador quiero consultar el historial de ajustes de un producto para entender cómo llegó a su stock actual y detectar pérdidas.
- **HU-7.** Como Administrador quiero definir un stock mínimo por producto para que el sistema me avise cuando toca reponer.
- **HU-8.** Como Cajero quiero consultar precio y stock de un producto para informar al cliente sin salir del mesón.
- **HU-9.** Como Administrador y como Cajero queremos ver qué productos están con stock bajo o agotados, y cuántos son, para no vender lo que no hay ni descubrirlo tarde.

## Definiciones

- **Producto activo:** aparece en el listado, en las alertas y está disponible para vender.
- **Producto desactivado:** no está disponible para vender ni genera alertas; conserva su stock, su historial y sus ventas pasadas, y puede reactivarse. Los productos nunca se eliminan.
- **Unidad de medida:** cada producto se cuenta en **unidades** (cantidades enteras) o en **kilos** (cantidades con hasta 3 decimales, por ejemplo 2,5 kg).
- **Stock actual:** cantidad disponible del producto según el sistema. Nunca es negativo.
- **Stock mínimo:** cantidad definida por el Administrador para cada producto desde la cual conviene reponer. El valor 0 significa "sin alerta".
- **Stock bajo:** producto activo con stock mínimo mayor a 0 y stock actual mayor a 0 y menor o igual a su stock mínimo.
- **Agotado:** producto activo con stock actual igual a 0 (se marca así aunque no tenga mínimo definido).
- **Ajuste manual de stock:** cambio del stock hecho a mano por el Administrador, con un motivo obligatorio:
  - **Merma:** pérdida de mercadería (vencimiento, rotura, robo, consumo propio). Resta stock.
  - **Reposición:** ingreso de mercadería comprada o recibida. Suma stock.
  - **Corrección:** el Administrador cuenta lo que hay realmente e ingresa ese total; el sistema fija el stock en esa cantidad y registra la diferencia.
- **Margen:** diferencia entre precio de venta y costo. Solo lo ve el Administrador.

## Requisitos funcionales (criterios de aceptación en EARS)

**Productos**

- **RF-1.** CUANDO el Administrador crea un producto, EL SISTEMA debe exigir nombre, precio de venta, costo, unidad de medida (unidad o kilo) y categoría, y permitir además un código de barras, un stock mínimo y un stock inicial.
- **RF-2.** SI el nombre está vacío o contiene solo espacios, ENTONCES EL SISTEMA debe rechazar el guardado y señalar el dato faltante.
- **RF-3.** EL SISTEMA debe aceptar precios y costos en pesos chilenos enteros, sin decimales, y exigir que el precio de venta sea mayor que 0 y el costo sea 0 o mayor.
- **RF-4.** SI el precio de venta es menor que el costo, ENTONCES EL SISTEMA debe advertir que se venderá con pérdida y permitir guardar solo si el Administrador lo confirma.
- **RF-5.** SI el código de barras indicado ya pertenece a otro producto, activo o desactivado, ENTONCES EL SISTEMA debe rechazar el guardado e indicar qué producto lo tiene.
- **RF-6.** CUANDO no se indica código de barras, EL SISTEMA debe guardar el producto sin él y permitir que varios productos queden sin código.
- **RF-7.** SI el producto se mide en unidades, ENTONCES EL SISTEMA debe aceptar el stock, el stock mínimo y los ajustes solo en cantidades enteras; SI se mide en kilos, ENTONCES EL SISTEMA debe aceptarlos con hasta 3 decimales.
- **RF-8.** CUANDO el Administrador crea un producto con stock inicial mayor que 0, EL SISTEMA debe registrar ese stock en el historial de movimientos como "stock inicial".
  - El stock mínimo y el stock inicial de un producto por kilo también aceptan hasta 3 decimales.
- **RF-9.** CUANDO el Administrador edita nombre, código de barras, categoría, precio de venta, costo o stock mínimo de un producto, EL SISTEMA debe guardar los cambios aplicando las mismas validaciones que al crear.
- **RF-10.** EL SISTEMA debe impedir editar el stock directamente desde la ficha del producto: el stock solo cambia por un ajuste manual o por una venta o anulación.
- **RF-11.** CUANDO el precio de venta de un producto cambia, EL SISTEMA debe aplicar el precio nuevo solo a ventas futuras, sin modificar las ventas ya registradas.
- **RF-12.** SI un producto ya tiene ventas o movimientos de stock, ENTONCES EL SISTEMA debe impedir cambiar su unidad de medida.
- **RF-13.** CUANDO el Administrador desactiva un producto, EL SISTEMA debe permitirlo con cualquier stock, retirarlo de la venta y de las alertas de inmediato, y conservar su stock, historial y ventas pasadas.
- **RF-14.** CUANDO el Administrador reactiva un producto, EL SISTEMA debe volver a ofrecerlo para la venta con el stock y los datos que tenía.
- **RF-15.** EL SISTEMA debe impedir la eliminación de productos; la baja se expresa únicamente como desactivación.
- **RF-16.** EL SISTEMA debe permitir asignar cada producto a una de las categorías existentes y mostrarlo como "Sin categoría" si no tiene.

**Consulta**

- **RF-17.** EL SISTEMA debe mostrar a Administrador y Cajero el listado de productos con nombre, categoría, precio de venta, unidad, stock actual y marca de stock bajo o agotado, mostrando primero los activos.
- **RF-18.** EL SISTEMA debe permitir buscar productos por nombre o código de barras y filtrar por categoría y por estado de stock (todos, stock bajo, agotados).
- **RF-19.** EL SISTEMA debe permitir a Administrador y Cajero ver también los productos desactivados, distinguiéndolos claramente de los activos con la marca "No disponible", y no debe permitir venderlos.
- **RF-20.** EL SISTEMA debe mostrar costo y margen únicamente al Administrador, y no entregarlos al Cajero por ninguna vía.
- **RF-21.** SI un Cajero intenta crear, editar, desactivar o ajustar un producto, ENTONCES EL SISTEMA debe denegar la acción con un mensaje claro de permisos insuficientes (spec 001, RF-14).

**Ajuste manual de stock**

- **RF-22.** CUANDO el Administrador ajusta el stock de un producto, EL SISTEMA debe exigir un motivo (merma, reposición o corrección) y una cantidad, y permitir una nota opcional.
- **RF-23.** CUANDO el motivo es merma, EL SISTEMA debe restar la cantidad indicada del stock; CUANDO es reposición, debe sumarla; CUANDO es corrección, debe fijar el stock en la cantidad contada.
- **RF-24.** SI la cantidad es 0, negativa o no cumple la unidad del producto, ENTONCES EL SISTEMA debe rechazar el ajuste (excepto una corrección a 0, que es válida).
- **RF-25.** SI un ajuste dejaría el stock en negativo, ENTONCES EL SISTEMA debe rechazarlo, mostrar el stock actual y no modificar nada.
- **RF-26.** CUANDO se confirma un ajuste, EL SISTEMA debe registrar el movimiento con fecha, hora, cuenta que lo hizo, motivo, nota, cantidad, stock antes y stock después, y actualizar el stock en una sola operación: o se guardan ambos o ninguno.
- **RF-27.** SI dos personas ajustan o venden el mismo producto al mismo tiempo, ENTONCES EL SISTEMA debe aplicar los cambios uno tras otro sin perder ninguno y sin dejar el stock en negativo.
- **RF-28.** EL SISTEMA debe permitir al Administrador consultar el historial de movimientos de un producto, del más reciente al más antiguo, incluyendo stock inicial, ajustes manuales y, cuando existan, las salidas por venta y las devoluciones por anulación con referencia a la venta (su detalle se define en la spec de ventas).
- **RF-29.** EL SISTEMA debe impedir modificar o eliminar movimientos del historial; un error se corrige con un nuevo ajuste.
- **RF-30.** SI un producto está desactivado, ENTONCES EL SISTEMA debe permitir ajustar su stock igualmente, para poder dar de baja la mercadería remanente.

**Stock bajo**

- **RF-31.** CUANDO el stock actual de un producto activo es menor o igual a su stock mínimo (y el mínimo es mayor a 0), EL SISTEMA debe marcarlo como "stock bajo" en el listado; CUANDO el stock es 0, debe marcarlo como "agotado".
- **RF-32.** CUANDO se ajusta el stock o se cambia el mínimo, EL SISTEMA debe recalcular la marca de inmediato.
- **RF-33.** EL SISTEMA debe mostrar a Administrador y Cajero, al ingresar, un resumen con la cantidad de productos con stock bajo y agotados que lleva al listado filtrado; el resumen del Cajero no incluye costos ni márgenes.
- **RF-34.** EL SISTEMA no debe mostrar alertas de productos desactivados.

## Requisitos no funcionales

- **RNF-1.** El stock nunca debe quedar negativo en ninguna circunstancia, incluso con operaciones simultáneas.
- **RNF-2.** Un ajuste y su registro en el historial deben guardarse completos o no guardarse; nunca uno sin el otro.
- **RNF-3.** El listado debe mostrarse y filtrarse en menos de 2 segundos con hasta 5.000 productos.
- **RNF-4.** Los montos deben mostrarse en formato CLP (ej. $1.490) y las cantidades en kilos con coma decimal (ej. 2,5 kg).
- **RNF-5.** Todos los textos y mensajes deben estar en español de Chile, sin jerga técnica, indicando qué debe hacer la persona.
- **RNF-6.** El costo y el margen no deben viajar ni aparecer en ninguna respuesta o pantalla del Cajero.
- **RNF-7.** El historial de movimientos debe conservarse sin límite de tiempo y no puede alterarse desde la interfaz.

## Casos límite

- **Código de barras repetido:** se rechaza y se indica qué producto ya lo usa, aunque ese producto esté desactivado.
- **Precio de venta menor al costo:** se advierte y se guarda solo con confirmación explícita.
- **Corrección a 0:** es válida y deja el producto agotado.
- **Merma mayor al stock disponible:** se rechaza y se muestra cuánto stock hay.
- **Ajuste simultáneo con una venta:** ambas operaciones se aplican en orden y ninguna deja el stock en negativo.
- **Producto desactivado con stock:** no se vende ni genera alertas, pero conserva su stock y puede ajustarse o reactivarse. Administrador y Cajero lo ven marcado como "No disponible".
- **Cambio de precio con una venta en curso:** la venta en curso conserva el precio con que se agregó el producto; el nuevo precio rige para las ventas siguientes.
- **Stock mínimo mayor al stock inicial:** es válido; el producto nace marcado como stock bajo.
- **Cantidades con decimales en un producto por unidad:** se rechazan; en un producto por kilo se aceptan hasta 3 decimales.
- **Nombre repetido:** se permite (puede haber dos productos con igual nombre y distinto código), pero se avisa al Administrador al guardar.
- **Producto sin categoría:** se muestra como "Sin categoría" y funciona normalmente.
- **Cajero accediendo por dirección directa a una pantalla de edición o de historial:** se deniega igual que desde el menú.

## Fuera de alcance

- Descontar stock por ventas y devolverlo al anular (spec de ventas); esta spec solo define que el stock no puede quedar negativo.
- Crear, editar o eliminar categorías (se usan las existentes).
- Compras a proveedores, órdenes de compra y gestión de proveedores.
- Lotes, fechas de vencimiento y números de serie.
- Otras unidades de medida (litros, metros, gramos) y conversiones entre unidades.
- Precios por volumen, ofertas, promociones y listas de precios.
- Historial de cambios de precio (solo queda el precio vigente y el congelado en cada venta).
- Importación o exportación masiva de productos (planillas).
- Imágenes de productos.
- Impresión de etiquetas y códigos de barras.
- Múltiples bodegas o sucursales.
- Alertas por correo o mensaje; las alertas son solo en pantalla.
- Reportes de valorización de inventario y de rotación.

## Criterios de finalización

- [x] El Administrador crea un producto por unidad y otro por kilo, con y sin código de barras, y ambos aparecen en el listado.
- [x] Un código de barras repetido se rechaza, incluso si pertenece a un producto desactivado.
- [x] Un precio de venta menor al costo muestra la advertencia y solo se guarda al confirmar.
- [x] El Administrador edita precio, costo, categoría y mínimo; el stock no se puede editar desde la ficha.
- [x] Desactivar un producto con stock lo retira de las alertas y de la consulta de productos vendibles sin perder su stock ni su historial; reactivarlo lo devuelve. *(El retiro efectivo del punto de venta se verifica con la spec de ventas.)*
- [x] No existe forma de eliminar un producto.
- [x] Un ajuste de merma, reposición y corrección actualiza el stock correctamente y deja el registro con fecha, cuenta, motivo, nota, stock antes y después.
- [x] Un ajuste que dejaría stock negativo se rechaza sin modificar nada.
- [x] Dos ajustes simultáneos sobre el mismo producto no pierden ninguno ni dejan stock negativo.
- [x] El historial de un producto se consulta y no puede modificarse ni borrarse.
- [x] Un producto con stock menor o igual a su mínimo aparece como "stock bajo", y con stock 0 como "agotado", en el listado de Administrador y Cajero.
- [x] Administrador y Cajero ven al ingresar el resumen de productos con stock bajo y agotados.
- [x] Un producto desactivado aparece como "No disponible" para ambos roles. *(Que no se pueda vender se verifica con la spec de ventas.)*
- [x] El historial de un producto por kilo acepta y muestra cantidades con decimales (ej. 2,5 kg).
- [x] El Cajero ve nombre, categoría, precio y stock, pero nunca costo ni margen, ni por pantalla ni por acceso directo.
- [x] El Cajero no puede crear, editar, desactivar ni ajustar productos.
- [x] Todos los montos están en CLP sin decimales y todos los textos en español.

## Dudas abiertas

No quedan dudas abiertas. Se registran las que estuvieron en discusión y cómo se resolvieron:

- **Decimales en productos por kilo.** El stock mínimo y el stock inicial aceptan hasta 3 decimales, igual que el stock y los ajustes (RF-7, RF-8).
- **Productos desactivados para el Cajero.** El Cajero los ve marcados como "No disponible" para poder responder a un cliente, pero no puede venderlos (RF-19).
- **Resumen de stock bajo para el Cajero.** El Cajero ve la marca por producto y también el resumen numérico, sin costos ni márgenes (RF-33).
- **Anulación de ventas en el historial.** El historial del producto incluye las salidas por venta y las devoluciones por anulación; su detalle y el momento en que se registran se definen en la spec de ventas (RF-28).
