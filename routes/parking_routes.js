const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const Parking = require('../models/modelParking'); // Modelo de Parking
const User = require('../models/modelUser'); // Modelo de Usuario
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Configuración de multer para guardar imágenes localmente
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Carpeta donde se guardarán las imágenes
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Nombre único para cada archivo
  },
});

const upload = multer({ storage });

// Ruta para crear un estacionamiento
router.post('/create', upload.single('imagen'), async (req, res) => {
  const { descripcion, ubicacion, precio, publicadorId } = req.body;

  try {
    const publicadorObjectId = new mongoose.Types.ObjectId(publicadorId);

    const publicador = await User.findById(publicadorObjectId);

    if (!publicador) {
      return res.status(404).json({ message: 'Usuario no encontrado', publicadorId });
    }

    // Si hay una imagen subida, guarda la ruta
    const imagen = req.file ? `/uploads/${req.file.filename}` : null;

    const newParking = new Parking({
      descripcion,
      ubicacion,
      precio,
      publicador: publicador._id,
      imagen, // Agregar la imagen al modelo
    });

    await newParking.save();

    res.status(201).json({ message: 'Estacionamiento creado exitosamente', parking: newParking });
  } catch (error) {
    console.error('Error al crear el estacionamiento:', error);
    res.status(500).json({ message: 'Error al crear el estacionamiento', error: error.message });
  }
});

// Ruta para reservar un estacionamiento
router.post('/reserve/:parkingId', async (req, res) => {
  const { parkingId } = req.params;
  const { userId } = req.body;

  try {
    const parking = await Parking.findById(parkingId);

    if (!parking) {
      return res.status(404).json({ message: 'Estacionamiento no encontrado' });
    }

    if (!parking.disponible) {
      return res.status(400).json({ message: 'El estacionamiento ya está reservado' });
    }

    if (parking.publicador.toString() === userId) {
      return res.status(400).json({ message: 'No puedes reservar tu propio estacionamiento' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    parking.disponible = false;
    parking.reservadoPor = user._id;

    await parking.save();

    res.status(200).json({ message: 'Estacionamiento reservado exitosamente', parking });
  } catch (error) {
    console.error('Error al reservar el estacionamiento:', error);
    res.status(500).json({ message: 'Error al reservar el estacionamiento', error: error.message });
  }
});

// Ruta para obtener todos los estacionamientos
router.get('/list', async (req, res) => {
  try {
    const parkings = await Parking.find().populate('publicador', 'nombre email');
    res.status(200).json({ parkings });
  } catch (error) {
    console.error('Error al obtener los estacionamientos:', error);
    res.status(500).json({ message: 'Error al obtener los estacionamientos', error: error.message });
  }
});

// Ruta para editar un estacionamiento
router.put('/edit/:parkingId', upload.single('imagen'), async (req, res) => {
  console.log('Datos recibidos:', req.body); // Verifica los datos enviados desde el frontend
  console.log('Archivo recibido:', req.file); // Verifica si la imagen se está recibiendo

  const { parkingId } = req.params;

  try {
    const parking = await Parking.findById(parkingId);

    if (!parking) {
      return res.status(404).json({ message: 'Estacionamiento no encontrado' });
    }

    // Actualizar los datos enviados en el cuerpo de la solicitud
    parking.descripcion = req.body.descripcion || parking.descripcion;
    parking.ubicacion = req.body.ubicacion || parking.ubicacion;
    parking.precio = req.body.precio || parking.precio;

    // Si hay una nueva imagen, actualizarla
    if (req.file) {
      parking.imagen = `/uploads/${req.file.filename}`;
    }

    const updatedParking = await parking.save();
    res.status(200).json({ message: 'Estacionamiento actualizado exitosamente', parking: updatedParking });
  } catch (error) {
    console.error('Error al actualizar el estacionamiento:', error);
    res.status(500).json({ message: 'Error al actualizar el estacionamiento', error: error.message });
  }
});

// Ruta para cancelar una reserva
router.post('/cancel-reservation/:parkingId', async (req, res) => {
  const { parkingId } = req.params;
  const { userId } = req.body;

  try {
    const parking = await Parking.findById(parkingId);

    if (!parking) {
      return res.status(404).json({ message: 'Estacionamiento no encontrado' });
    }

    // Verifica si el estacionamiento está reservado
    if (parking.disponible) {
      return res.status(400).json({ message: 'El estacionamiento ya está disponible' });
    }

    // Verifica si el usuario es el que hizo la reserva
    if (String(parking.reservadoPor) !== String(userId)) {
      return res.status(403).json({ message: 'No puedes cancelar una reserva que no realizaste' });
    }

    // Si todo es correcto, cancela la reserva
    parking.disponible = true;
    parking.reservadoPor = null;

    await parking.save();

    res.status(200).json({ message: 'Reserva cancelada exitosamente', parking });
  } catch (error) {
    console.error('Error al cancelar la reserva:', error);
    res.status(500).json({ message: 'Error al cancelar la reserva', error: error.message });
  }
});

// Ruta para obtener los estacionamientos reservados por un usuario
router.get('/reservados/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Verificar si el userId es válido
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'ID de usuario no válido' });
    }

    const objectId = new mongoose.Types.ObjectId(userId);

    // Buscar los estacionamientos reservados por el usuario
    const parkings = await Parking.find({ reservadoPor: objectId }).populate('publicador', 'nombre email');

    // Devolver un array vacío si no hay reservas
    if (parkings.length === 0) {
      return res.status(200).json({ parkings: [] });
    }

    // Devolver los estacionamientos reservados
    res.status(200).json({ parkings });
  } catch (error) {
    console.error('Error al obtener los estacionamientos reservados:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});

// Ruta para obtener los estacionamientos publicados por un usuario
router.get('/publicados/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const objectId = new mongoose.Types.ObjectId(userId);

    const parkings = await Parking.find({ publicador: objectId }).populate('publicador', 'nombre email');

    if (parkings.length === 0) {
      return res.status(404).json({ message: 'No has publicado ningún estacionamiento' });
    }

    res.status(200).json({ parkings });
  } catch (error) {
    console.error('Error al obtener los estacionamientos publicados:', error);
    res.status(500).json({ message: 'Error interno del servidor', error: error.message });
  }
});

// Ruta para eliminar un estacionamiento
router.delete('/delete/:parkingId', async (req, res) => {
  const { parkingId } = req.params;
  console.log('Intentando eliminar estacionamiento con ID:', parkingId); // Log del ID recibido

  try {
    // Buscar el estacionamiento por ID
    const parking = await Parking.findById(parkingId);
    if (!parking) {
      console.log('Estacionamiento no encontrado');
      return res.status(404).json({ message: 'Estacionamiento no encontrado' });
    }

    // Eliminar el archivo de imagen asociado, si existe
    if (parking.imagen) {
      const imagePath = path.join(__dirname, '..', parking.imagen);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath); // Elimina la imagen del sistema de archivos
        console.log('Imagen asociada eliminada');
      }
    }

    // Eliminar el documento del estacionamiento
    await parking.deleteOne();
    console.log('Estacionamiento eliminado exitosamente');
    res.status(200).json({ message: 'Estacionamiento eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar el estacionamiento:', error);
    res.status(500).json({ message: 'Error al eliminar el estacionamiento', error: error.message });
  }
});
module.exports = router;
