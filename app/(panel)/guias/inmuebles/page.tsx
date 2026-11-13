import type { Metadata } from 'next'
import { Aviso } from '@/components/campos'
import { B, Etapa, Paso } from '../pasos'

export const metadata: Metadata = { title: 'Guía: gestión de inmuebles' }

export default function GuiaInmuebles() {
  return (
    <>
      <Aviso>
        Un inmueble pasa por cuatro estados: <strong>En captación</strong> (el propietario aún no firma),{' '}
        <strong>En cartera</strong> (contrato firmado; se publica y entra al match), <strong>Vendido</strong> y{' '}
        <strong>Retirado</strong>.
      </Aviso>

      <Etapa titulo="1. Ingresar el inmueble" cuando="Hay dos caminos, según si el propietario ya firmó el contrato.">
        <Paso
          n={1}
          titulo="Camino normal: desde el lead propietario"
          donde={{ texto: 'Ficha del lead → Citas e inmueble' }}
        >
          <p>
            Tras la primera cita, toca <B>Registrar resultado</B> y luego <B>Guardar y crear ficha del inmueble</B>. El
            inmueble queda En captación. Los pasos previos están en la guía de gestión de leads.
          </p>
        </Paso>
        <Paso
          n={2}
          titulo="Camino directo: el contrato ya está firmado"
          donde={{ texto: 'Inmuebles → Nuevo inmueble', href: '/inmuebles' }}
        >
          <p>
            Toca <B>Nuevo inmueble</B> y llena en un solo formulario los datos del propietario, del inmueble y del
            contrato. Al guardar con <B>Registrar inmueble</B>, el inmueble entra En cartera y se abre su ficha para
            subir las fotos. Si el teléfono del propietario ya existe, se une a su registro.
          </p>
        </Paso>
      </Etapa>

      <Etapa titulo="2. Completar la ficha">
        <Paso n={1} titulo="Sube las fotos" donde={{ texto: 'Ficha del inmueble → Fotos' }}>
          <p>
            Toca <B>Elegir fotos</B>; puedes subir varias a la vez. La primera es la portada: para cambiarla, toca{' '}
            <B>Portada</B> en otra foto.
          </p>
        </Paso>
        <Paso n={2} titulo="Revisa los datos" donde={{ texto: 'Ficha del inmueble → Datos del inmueble' }}>
          <p>
            Con <B>Editar</B> completa tipo, conservación, precio de venta, metraje, dormitorios, baños, cocheras,
            características y descripción. La dirección no se publica: en la descripción escribe la zona, nunca la
            dirección exacta.
          </p>
        </Paso>
        <Paso n={3} titulo="Registra los datos de acceso" donde={{ texto: 'Ficha del inmueble → Acceso' }}>
          <p>
            Con <B>Editar</B> anota llave, código, si piden DNI y otras consideraciones. Las visitas toman estos datos
            al agendarse.
          </p>
        </Paso>
      </Etapa>

      <Etapa
        titulo="3. Registrar el contrato"
        cuando="Solo si el inmueble entró por el camino normal y está En captación."
      >
        <Paso n={1} titulo="Registra el contrato firmado" donde={{ texto: 'Ficha del inmueble → Contrato' }}>
          <p>
            Toca <B>Registrar contrato</B> y llena fecha de firma, plazo en meses, comisión, si es con exclusividad y si
            autoriza publicar. La copia escaneada es opcional.
          </p>
          <p>Al guardar, el inmueble pasa a En cartera y el propietario a Cliente.</p>
        </Paso>
      </Etapa>

      <Etapa titulo="4. Difundir el inmueble" cuando="Solo inmuebles En cartera cuyo propietario autorizó publicar.">
        <Paso n={1} titulo="Publícalo en el sitio web" donde={{ texto: 'Inmuebles', href: '/inmuebles' }}>
          <p>
            Los inmuebles En cartera con autorización se muestran en el sitio web. Después de registrar o editar uno,
            toca <B>Actualizar web</B>. Para resaltarlo, marca <B>Destacado en el sitio web</B> al editar sus datos.
          </p>
        </Paso>
        <Paso n={2} titulo="Publica el sugerido del día en redes" donde={{ texto: 'Difusión', href: '/difusion' }}>
          <p>
            <B>Sugerido para hoy</B> rota los inmuebles: primero los nuevos, luego los de menor interés. Publícalo en
            las redes y en el Canal de WhatsApp, y después toca <B>Registrar publicación</B>: marca dónde lo publicaste,
            la fecha y el texto, y confirma.
          </p>
        </Paso>
        <Paso
          n={3}
          titulo="Usa el enlace de WhatsApp de cada publicación"
          donde={{ texto: 'Difusión → Publicaciones', href: '/difusion' }}
        >
          <p>
            Cada red recibe su propio enlace. Toca <B>Copiar texto con enlace</B> y pégalo en la publicación: así cada
            lead que escriba queda asociado al inmueble y a la publicación.
          </p>
        </Paso>
        <Paso
          n={4}
          titulo="Anota las vistas e interacciones"
          donde={{ texto: 'Difusión → Publicaciones', href: '/difusion' }}
        >
          <p>
            Con <B>Editar enlace y métricas</B>, ingresa el total acumulado que muestra la red. Se anota a mano mientras
            no haya integración.
          </p>
        </Paso>
        <Paso
          n={5}
          titulo="Avisa a los interesados a los que les encaja"
          donde={{ texto: 'Ficha del inmueble → Interesados a los que les encaja' }}
        >
          <p>
            La lista muestra a los interesados activos cuyo perfil y capacidad encajan. Toca <B>Enviar novedad</B> en
            cada uno. El panel respeta el tope de frecuencia y las bajas.
          </p>
        </Paso>
      </Etapa>

      <Etapa titulo="5. Informar al propietario">
        <Paso n={1} titulo="Revisa el interés acumulado" donde={{ texto: 'Ficha del inmueble → Interés acumulado' }}>
          <p>Leads generados, veces enviado como match, respuestas Me interesa y visitas realizadas.</p>
        </Paso>
        <Paso
          n={2}
          titulo="Envía el resumen de insights"
          donde={{ texto: 'Ficha del inmueble → Insights para el propietario' }}
        >
          <p>
            Revisa el resumen del periodo y toca <B>Enviar al propietario</B>. La frecuencia es configurable (por
            defecto, semanal); el panel avisa cuántos días faltan para el siguiente.
          </p>
        </Paso>
      </Etapa>

      <Etapa titulo="6. Vencimiento del contrato">
        <Paso
          n={1}
          titulo="Atiende el aviso de contratos por vencer"
          donde={{ texto: 'Hoy → Contratos por vencer', href: '/' }}
        >
          <p>
            El panel avisa con la anticipación configurada (por defecto, 30 días). El inmueble también lleva una marca
            de vencimiento en la base y en su ficha.
          </p>
        </Paso>
        <Paso n={2} titulo="Renueva o retira" donde={{ texto: 'Ficha del inmueble → Contrato' }}>
          <ul>
            <li>
              <B>Renovar</B>: registra el nuevo contrato con su fecha, plazo y condiciones.
            </li>
            <li>
              <B>Retirar</B>: indica el motivo. El inmueble sale de la base: deja de publicarse y de ofrecerse en el
              match.
            </li>
          </ul>
        </Paso>
      </Etapa>

      <Etapa titulo="7. Venta">
        <Paso
          n={1}
          titulo="El cierre se registra en la ficha del comprador"
          donde={{ texto: 'Ficha del lead interesado → Compraventa' }}
        >
          <p>
            Al tocar <B>Registrar cierre</B> en la compraventa del interesado, el inmueble pasa solo a Vendido y sale de
            la base. No hay que cambiar nada en la ficha del inmueble.
          </p>
        </Paso>
      </Etapa>

      <Etapa titulo="Consultar la base de propiedades">
        <Paso n={1} titulo="Filtra y abre una ficha" donde={{ texto: 'Inmuebles', href: '/inmuebles' }}>
          <p>
            Filtra por estado, distrito, tipo y rango de precio. Por defecto se muestran los En captación y En cartera;
            para ver Vendidos y Retirados, cambia el filtro de estado.
          </p>
        </Paso>
      </Etapa>
    </>
  )
}
